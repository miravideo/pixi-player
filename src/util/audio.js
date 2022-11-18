import XhrUtil from "./xhr";
const fft = require('fourier-transform');

const __cache = {};
if (global) {
  global.PIXIPLR_ABR_CACHE = __cache;
}

class Analyser {
  static defaultProperties = {
    fftSize: 1024,
  };

  static KEYS = ['max', 'avg', 'min', 'fft', 'gain']

  constructor(fftSize) {
    this.properties = Analyser.defaultProperties;
    this._time = 0;
    if (fftSize) this.properties.fftSize = fftSize;
    this.init();
  }

  blackMan(i, N) {
    const a0 = 0.42,
        a1 = 0.5,
        a2 = 0.08,
        f = 6.283185307179586 * i / (N - 1)

    return a0 - a1 * Math.cos(f) + a2 * Math.cos(2*f)
  }

  init() {
    const {
      properties: { fftSize },
    } = this;

    // this.FFTParser = new FFTParser();
    this.oriFFT = new Float32Array(fftSize / 2);
    this.td = new Float32Array(fftSize);

    this.blackmanTable = new Float32Array(fftSize);


    for (let i = 0; i < fftSize; i++) {
      this.blackmanTable[i] = this.blackMan(i, fftSize);
    }

    this.buffer = new Float32Array(fftSize);

    this.smoothing = new Float32Array(fftSize / 2);
    this.last = {};
    this.smoothings = {};
  }

  getFloatTimeDomainData(array) {
    array.set(this.buffer);
  }

  getFloatFrequencyData(array) {
    const { fftSize } = this.properties;
    const waveform = new Float32Array(fftSize);

    // Get waveform from buffer
    this.getFloatTimeDomainData(waveform);

    // Apply blackman function
    for (let i = 0; i < fftSize; i++) {
      waveform[i] = waveform[i] * this.blackmanTable[i] || 0;
    }

    const spectrum = fft(waveform);

    for (let i = 0, n = fftSize / 2; i < n; i++) {
      array[i] = spectrum[i];
    }
  }

  getByteFrequencyData(array) {
    const { fftSize } = this.properties;
    const spectrum = new Float32Array(fftSize / 2);

    this.getFloatFrequencyData(spectrum);

    for (let i = 0, n = spectrum.length; i < n; i++) {
      array[i] = spectrum[i] * 255 / 2;
    }
  }

  process(input) {
    const { fftSize } = this.properties;
    const merged = new Float32Array(fftSize);

    // 把所有chanel都相加，并根据fftSize切片
    for (let chanelData of input) {
      for (let i = 0; i < fftSize; i++) {
        merged[i] += chanelData[i] || 0;
      }
    }

    this.buffer = merged;
    this.updateTimeData();
    this.updateFrequencyData();
    let max = this.td[0], min = this.td[0], total = 0;
    for (let i = 0; i < this.td.length; i++) {
      if (this.td[i] > max) {
        max = this.td[i];
      }

      if (this.td[i] < min) {
        min = this.td[i];
      }

      total += this.td[i];
    }
    this.max = max;
    this.min = min;
    this.avg = total / this.td.length;
    this.fft = this.oriFFT;
    this.gain = this.oriFFT.reduce((a, b) => a + b) / this.oriFFT.length;
  }

  slice(start, end, dataType='td') {
    const data = this[dataType];
    if (!data || start >= end) return
    let max = data[0], min = data[0], total = 0;
    for (let i = start; i < end; i++) {
      if (data[i] > max) {
        max = data[i];
      }

      if (data[i] < min) {
        min = data[i];
      }

      total += data[i];
    }
    return {max, min, avg: total / (end - start)}
  }

  movingAverage(key, smooth) {
    this.last[key] = (this.last[key] || this[key]) * smooth + this[key] * (1 - smooth);
    return this.last[key]
  }

  updateFrequencyData() {
    this.getByteFrequencyData(this.oriFFT);
  }

  updateTimeData() {
    this.td = this.buffer;
  }

  reset() {
    this.fft.fill(0);
    this.oriFFT.fill(0);
    this.td.fill(0);
    this.smoothing.fill(0);
  }
}

const AudioUtil = {
  clear: (cid) => {
    delete __cache[cid];
  },
  getBuffer: async (path, cid, sampleRate, onprogress) => {
    if (!__cache[cid]) __cache[cid] = {};
    if (__cache[cid][path]) return __cache[cid][path];
    const promise = new Promise(async (resolve) => {
      const ctx = new AudioContext({sampleRate});
      const res = await XhrUtil.getRemote(path, cid, (p) => {
        const { total, loaded } = p;
        total && onprogress && onprogress(loaded / total);
      });
      if (!res || !res.data) return resolve();
      // const res = await fetch(path, { method: 'GET', responseType: 'arraybuffer' });
      const fileData = await res.data.arrayBuffer();
      ctx.decodeAudioData(fileData, (buffer) => {
        if (__cache[cid]) __cache[cid][path] = buffer;
        resolve(buffer);
      }, (e) => {
        console.log(e);
        resolve();
      });
    });
    __cache[cid][path] = promise;
    return promise;
  },

  encodeWAV(samples, format, sampleRate, numChannels, bitDepth) {
    var bytesPerSample = bitDepth / 8
    var blockAlign = numChannels * bytesPerSample

    var buffer = new ArrayBuffer(44 + samples.length * bytesPerSample)
    var view = new DataView(buffer)

    /* RIFF identifier */
    this.writeString(view, 0, 'RIFF')
    /* RIFF chunk length */
    view.setUint32(4, 36 + samples.length * bytesPerSample, true)
    /* RIFF type */
    this.writeString(view, 8, 'WAVE')
    /* format chunk identifier */
    this.writeString(view, 12, 'fmt ')
    /* format chunk length */
    view.setUint32(16, 16, true)
    /* sample format (raw) */
    view.setUint16(20, format, true)
    /* channel count */
    view.setUint16(22, numChannels, true)
    /* sample rate */
    view.setUint32(24, sampleRate, true)
    /* byte rate (sample rate * block align) */
    view.setUint32(28, sampleRate * blockAlign, true)
    /* block align (channel count * bytes per sample) */
    view.setUint16(32, blockAlign, true)
    /* bits per sample */
    view.setUint16(34, bitDepth, true)
    /* data chunk identifier */
    this.writeString(view, 36, 'data')
    /* data chunk length */
    view.setUint32(40, samples.length * bytesPerSample, true)
    if (format === 1) { // Raw PCM
      this.floatTo16BitPCM(view, 44, samples)
    } else {
      this.writeFloat32(view, 44, samples)
    }

    return buffer;
  },
  interleave(inputL, inputR) {
    var length = inputL.length + inputR.length
    var result = new Float32Array(length)

    var index = 0
    var inputIndex = 0

    while (index < length) {
      result[index++] = inputL[inputIndex]
      result[index++] = inputR[inputIndex]
      inputIndex++
    }
    return result
  },
  writeFloat32(output, offset, input) {
    for (var i = 0; i < input.length; i++, offset += 4) {
      output.setFloat32(offset, input[i], true)
    }
  },
  floatTo16BitPCM(output, offset, input) {
    for (var i = 0; i < input.length; i++, offset += 2) {
      var s = Math.max(-1, Math.min(1, input[i]))
      output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    }
  },
  writeString(view, offset, string) {
    for (var i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  },
  async applyGain(data, vol) {
    if (!AudioUtil.worker) {
      const code = `
      self.addEventListener('message', function (e) {
        const { data, vol } = e.data;
        for (let i = 0; i < data.length; i++) {
          data[i] *= vol;
        }
        self.postMessage(data);
      }, false);
      `;
      const url = URL.createObjectURL(new Blob([code]));
      AudioUtil.worker = new Worker(url);
      AudioUtil.worker.onmessage = (e) => {
        AudioUtil.callback && AudioUtil.callback(e.data);
      }
    }
    return new Promise((resolve) => {
      AudioUtil.callback = (_data) => {
        console.log('onmessage', _data);
        resolve(_data);
      }
      AudioUtil.worker.postMessage({ data, vol });
      console.log('postMessage', data);
    });
  },
  mergeBuffers() {
    ;
  },
  Analyser
};

export default AudioUtil;
