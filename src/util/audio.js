import XhrUtil from "./xhr";

const __cache = {};
if (global) {
  global.PIXIPLR_ABR_CACHE = __cache;
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
        // buffer = {length: 3130041, duration: 70.92, sampleRate: 44100, numberOfChannels: 2}
        // if (tail > 0) {
        //   // 在音频末尾补上一段静音，避免SoundTouch播放的时候把尾巴吞掉了
        //   const tailLen = Math.round(tail * buffer.sampleRate);
        //   const n = buffer.numberOfChannels;
        //   const _buffer = ctx.createBuffer(n, buffer.length + tailLen, buffer.sampleRate);
        //   const _tail = new Float32Array(tailLen);
        //   for (var i = 0; i < n; i++) {
        //     const channel = _buffer.getChannelData(i);
        //     channel.set(buffer.getChannelData(i), 0);
        //     channel.set(_tail, buffer.length);
        //   }
        //   buffer = _buffer;
        // }
      if (__cache[cid]) __cache[cid][path] = buffer;
        resolve(buffer);
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
  }
};

export default AudioUtil;
