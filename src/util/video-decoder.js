
class MP4FileSink {
  constructor(file, setStatus) {
    this.offset = 0;
    this.file = file;
    this.setStatus = setStatus;
  }

  write(chunk) {
    // MP4Box.js requires buffers to be ArrayBuffers, but we have a Uint8Array.
    const buffer = new ArrayBuffer(chunk.byteLength);
    new Uint8Array(buffer).set(chunk);

    // Inform MP4Box where in the file this chunk is from.
    buffer.fileStart = this.offset;
    this.offset += buffer.byteLength;

    // Append chunk.
    this.setStatus("fetch", (this.offset / (1024 ** 2)).toFixed(1) + " MiB");
    this.file.appendBuffer(buffer);
  }

  close() {
    this.setStatus("fetch", "Done");
    this.file.flush();
  }
}

class MP4Decoder {
  constructor({ url, numberOfChannels }) {
    this.id = Math.random().toString(36).substr(-8) + Math.random().toString(36).substr(-8);
    this.url = url;
    this.ready = false;
    this._extractcallbacks = [];
    this.kfs = [];
    this._frameTimer = {};
    this.audioOutput = { numberOfChannels };

    this.videoDecoder = new VideoDecoder({
      output: (frame) => this.voutput(frame),
      error: (error) => { },
    });

    this.audioDecoder = new AudioDecoder({
      output: (frame) => this.aoutput(frame),
      error: (error) => { },
    });

    // Configure an MP4Box File for demuxing.
    this.file = MP4Box.createFile();
    this.file.onError = error => { };
    this.file.onReady = this.onReady.bind(this);
    this.file.onSamples = this.onSamples.bind(this);

    // Fetch the file and pipe the data through.
    const fileSink = new MP4FileSink(this.file, (statue, desc) => {
      // console.log(statue, desc);
    });
    fetch(url).then(response => {
      // highWaterMark should be large enough for smooth streaming, but lower is
      // better for memory usage.
      response.body.pipeTo(new WritableStream(fileSink, {highWaterMark: 2}));
    });
  }

  async loadmeta() {
    if (this.ready) return this.meta;
    // todo: timeout
    return new Promise((resolve, reject) => {
      this._metacallbacks.push({resolve, reject});
    });
  }

  async extract({ type, start, end, reqId }) {
    return new Promise((resolve, reject) => {
      this._extractcallbacks.push({ type, start, end, reqId, resolve, reject });
      this.extractNext();
    });
  }

  extractNext() {
    if (this.extracting) return false;
    const item = this._extractcallbacks.shift();
    // console.log('extractNext', item);
    if (!item) {
      this.extracting = false;
      this.extractingRequest = null;
      this.frames = [];
      return;
    }
    try {
      this.file.flush();
      this.file.stop();
      this._extractStart = performance.now();
      this.extracting = true;
      this.extractingRequest = item;
      this.frames = [];
      // console.log('extract start', item.type, item.reqId);
      let start = item.start;
      // 每次开始前，必须要unset，否则会带着上次的
      this.file.unsetExtractionOptions(this.vtrackId);
      this.file.unsetExtractionOptions(this.atrackId);
      if (item.type === 'video') {
        // todo: 其实没必要...
        for (const kf of this.kfs) {
          if (kf > item.start) break;
          start = kf;
        }
        // console.log('extractNext start', start, this.kfs);
        this.file.setExtractionOptions(this.vtrackId, 'video', { nbSamples: 100 });
      } else {
        this.file.setExtractionOptions(this.atrackId, 'audio', { nbSamples: 100 });
      }
      this.file.seek(start, true);
      this.file.start();
    } catch (err) {
      this.extracting = false;
      this.extractingRequest = null;
      item.reject(err);
      this.fetchNext();
    }
  }

  async aoutput(frame) {
    if (!this.extractingRequest) return frame.close();
    const { start, end, reqId, resolve, reject } = this.extractingRequest;

    const t = frame.timestamp / 1e6;
    const d = frame.duration  / 1e6;
    const format = `${frame.format}`;
    const isPlanar = format.endsWith('planar');
    const { numberOfChannels } = this.audioOutput;
    if (t + d >= start && t <= end) {
      const data = [];
      if (isPlanar) {
        for (let c = 0; c < Math.min(numberOfChannels, frame.numberOfChannels); c++) {
          const opt = { planeIndex: c };
          const ab = new ArrayBuffer(frame.allocationSize(opt));
          frame.copyTo(ab, opt);
          data.push(ab);
        }
      } else {
        // todo: 待调试
        const opt = { planeIndex: 0 };
        const ab = new ArrayBuffer(frame.allocationSize(opt));
        frame.copyTo(ab, opt);
        const bitLen = format.includes('32') ? 32 : (format.includes('16') ? 16 : 8);
        const mixData = bitLen == 32 ? new Uint32Array(ab) : (bitLen == 16 ? new Uint16Array(ab) : new Uint8Array(ab)); 
        for (let c = 0; c < Math.min(numberOfChannels, frame.numberOfChannels); c++) {
          const chData = bitLen == 32 ? new Uint32Array(frame.numberOfFrames) : (bitLen == 16 ? new Uint16Array(frame.numberOfFrames) : new Uint8Array(frame.numberOfFrames)); 
          for (let i = 0; i < chData.length; i++) {
            chData[i] = mixData[(i * frame.numberOfChannels) + c];
          }
          data.push(chData.buffer);
        }
      }
      this.frames.push({ data, t, d, format, size: frame.numberOfFrames });
    }
    frame.close();
    this.currentTime = t;

    // stop
    if (t >= Math.min(end, this.meta.lastFrame)) {
      this.file.stop();
      this.file.flush();
      this.extractFinish();
    }
  }

  async voutput(frame) {
    // console.log('voutput', frame.timestamp, this.extractingRequest);
    if (!this.extractingRequest) return frame.close();

    const { start, end, reqId, resolve, reject } = this.extractingRequest;

    const t = frame.timestamp / 1e6;
    const d = frame.duration  / 1e6;
    // console.log('frame', t, frame.format, frame.colorSpace.matrix);
    if (t + d >= start && t <= end) {
      this.frames.push({ data: this.getImage(frame), t, d });
    }
    frame.close();
    this.currentTime = t;

    // console.log('frame', t, end, this.videoDecoder.decodeQueueSize, this.videoDecoder.state);

    // stop
    if (t >= Math.min(end, this.meta.lastFrame)) {
      this.file.stop();
      this.file.flush();
      this.extractFinish();
    }
  }

  extractFinish() {
    if (!this.extractingRequest) return;
    const { type, reqId, resolve } = this.extractingRequest;
    // console.log('reset!');

    if (type === 'video') {
      this.videoDecoder.reset(); // empty decode queue
      this.videoDecoder.configure(this.vconfig);
    } else {
      this.audioDecoder.reset(); // empty decode queue
      this.audioDecoder.configure(this.aconfig);

      const { numberOfChannels } = this.audioOutput;
      const totalByteLength = this.frames.reduce((a, b) => a + b.data[0].byteLength, 0);
      const totalSamples = this.frames.reduce((a, b) => a + b.size, 0);

      let data = [];
      for (let c = 0; c < numberOfChannels; c++) {
        let concatBuffer = new Uint8Array(totalByteLength);
        let offset = 0;
        let rc = Math.min(c, this.meta.numberOfChannels - 1);
        for (const frame of this.frames) {
          concatBuffer.set(new Uint8Array(frame.data[rc]), offset);
          offset += frame.data[rc].byteLength;
        }
        let format = this.frames[0].format.replace('-planar', '');
        let _data, fdata;
        switch (format) {
          case 'u8':
            _data = new Uint8Array(concatBuffer.buffer);
            fdata = new Float32Array(_data.length);
            _data.map((v, k) => fdata[k] = (v - 128) / 128);
            break;
          case 's16':
            _data = new Uint16Array(concatBuffer.buffer);
            fdata = new Float32Array(_data.length);
            _data.map((v, k) => fdata[k] = v / 32768);
            break;
          case 's32':
            _data = new Uint32Array(concatBuffer.buffer);
            fdata = new Float32Array(_data.length);
            _data.map((v, k) => fdata[k] = v / 2147483648);
            break;
          default:
            fdata = new Float32Array(concatBuffer.buffer);
            break;
        }
        data.push(fdata);
      }

      this.frames = data.map(d => {
        return { 
          data: d.buffer, 
          t: this.frames[0].t, 
          sampleRate: this.meta.sampleRate
        };
      });
    }

    resolve(this.frames);
    // console.log('worker extract cost:', { type, 
    //   from: this.frames[0].t.toFixed(3), 
    //   to: this.frames[this.frames.length - 1].t.toFixed(3), 
    //   len: this.frames.length, 
    //   cost_ms: Math.round(performance.now() - this._extractStart)
    // });
    // console.log('extract end', type, reqId);
    this.extracting = false;
    this.extractNext();
  }

  onSamples(track_id, type, samples) {
    const last = samples[samples.length - 1];
    const lastTime = last.cts / last.timescale;
    // console.log('sample', type, samples.length, last.cts / last.timescale);
    if (type === 'probe') {
      if (track_id === this.vtrackId) {
        for (const sample of samples) {
          if (sample.is_sync) this.kfs.push(sample.cts / sample.timescale);
        }
        // -0.1是为了避免最后缺帧
        if (lastTime >= this.meta.duration - 0.1) {
          this.meta.keyframes = this.kfs.length;
          this.meta.lastFrame = lastTime;
          // console.log('probe done!!', this.kfs, performance.now() - this._probeStart);
          self.postMessage({ method: 'ready', meta: this.meta });
        }
      }
      return;
    }

    const decoder = type === 'video' ? this.videoDecoder : this.audioDecoder;
    const chunkClass = type === 'video' ? EncodedVideoChunk : EncodedAudioChunk;
    for (const sample of samples) {
      const t = sample.cts / sample.timescale;
      decoder.decode(new chunkClass({
        type: sample.is_sync ? "key" : "delta",
        timestamp: 1e6 * sample.cts / sample.timescale,
        duration: 1e6 * sample.duration / sample.timescale,
        data: sample.data
      }));
    }

    // if (type === 'video') console.log('samples', { 
    //   len: samples.length, 
    //   from: samples[0].cts / samples[0].timescale,
    //   to: lastTime,
    //   kfs: JSON.stringify(samples.filter(s => s.is_sync).map(sample => sample.cts / sample.timescale))
    // });

    const { end } = this.extractingRequest;
    // end + 0.5s 是为了避免后面的B帧先满足了时间，flush之后没有I帧，出不来
    if (lastTime >= Math.min(end + 0.5, this.meta.lastFrame)) {
      this.file.stop();
      // 调用flush，避免一些帧在queue里出不来
      decoder.flush().catch(e => {
        // console.log(e, reqId);
      }).finally(() => {
        // video在flush之后，必须接着关键帧，所以只能结束了
        if (type === 'video') return this.extractFinish();
        else if (this.extracting) this.file.start();
      });
    }
  }

  onReady(info) {
    // video decoder config
    // console.log('ready!', info);

    const vtrack = info.videoTracks[0];
    this.vconfig = {
      codec: vtrack.codec,
      codedHeight: vtrack.video.height,
      codedWidth: vtrack.video.width,
      description: this.videoDescription(vtrack),
    };
    this.videoDecoder.configure(this.vconfig);
    this.vtrackId = vtrack.id;

    const atrack = info.audioTracks[0];
    if (atrack) {
      this.aconfig = {
        codec: atrack.codec,
        sampleRate: atrack.audio.sample_rate,
        numberOfChannels: atrack.audio.channel_count,
        sampleSize: atrack.audio.sample_size,
      }
      this.audioDecoder.configure(this.aconfig);
      this.atrackId = atrack.id;  
    } else {
      this.atrackId = undefined;
      this.aconfig = { sampleRate: 0, numberOfChannels: 0, sampleSize: 0 };
    }

    const { width, height } = vtrack.video;
    const { sampleRate, numberOfChannels, sampleSize } = this.aconfig;
    const frames = vtrack.nb_samples;
    const duration = vtrack.duration / vtrack.timescale;
    const fps = (frames / duration).toFixed(6);
    this.meta = { width, height, frames, duration, sampleRate, numberOfChannels, sampleSize, fps };

    this.prepareCanvas();
    this.ready = true;

    this._probeStart = performance.now();
    this.file.setExtractionOptions(this.vtrackId, 'probe');
    this.file.seek(0, true);
    this.file.start();
    // self.postMessage({ method: 'ready', meta: this.meta });
  }

  getImage(frame) {
    // console.log('frame', frame.timestamp, frame.format);

    // this.ctx.drawImage(frame, 0, 0, frame.displayWidth, frame.displayHeight);

    const gl = this.ctx;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
    // Configure and clear the drawing area.
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(1.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Draw the frame.
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    return this.canvas.transferToImageBitmap();
  }

  prepareCanvas() {
    this.canvas = new OffscreenCanvas(this.meta.width, this.meta.height);
    // this.ctx = this.canvas.getContext('2d');
    // this.ctx = this.canvas.getContext('bitmaprenderer');
    // return;

    const gl = this.ctx = this.canvas.getContext('webgl2', {
      alpha: false, desynchronized: true, antialias: false, 
      powerPreference: "high-performance",
    });
    const vertexShaderSource = `
      attribute vec2 xy;
      varying highp vec2 uv;
      void main(void) {
        gl_Position = vec4(xy, 0.0, 1.0);
        // Map vertex coordinates (-1 to +1) to UV coordinates (0 to 1).
        // UV coordinates are Y-flipped relative to vertex coordinates.
        uv = vec2((1.0 + xy.x) / 2.0, (1.0 - xy.y) / 2.0);
      }
    `;
    const fragmentShaderSource = `
      varying highp vec2 uv;
      uniform sampler2D texture;
      void main(void) {
        gl_FragColor = texture2D(texture, uv);
      }
    `;

    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexShaderSource);
    gl.compileShader(vertexShader);
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      throw gl.getShaderInfoLog(vertexShader);
    }

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentShaderSource);
    gl.compileShader(fragmentShader);
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      throw gl.getShaderInfoLog(fragmentShader);
    }

    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram (shaderProgram );
    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      throw gl.getProgramInfoLog(shaderProgram);
    }
    gl.useProgram(shaderProgram);

    // Vertex coordinates, clockwise from bottom-left.
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1.0, -1.0,
      -1.0, +1.0,
      +1.0, +1.0,
      +1.0, -1.0
    ]), gl.STATIC_DRAW);

    const xyLocation = gl.getAttribLocation(shaderProgram, "xy");
    gl.vertexAttribPointer(xyLocation, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(xyLocation);

    // Create one texture to upload frames to.
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  // Get the appropriate `description` for a specific track. Assumes that the
  // track is H.264 or H.265.
  videoDescription(track) {
    const trak = this.file.getTrackById(track.id);
    for (const entry of trak.mdia.minf.stbl.stsd.entries) {
      if (entry.avcC || entry.hvcC) {
        const { DataStream } = MP4Box;
        const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
        if (entry.avcC) {
          entry.avcC.write(stream);
        } else {
          entry.hvcC.write(stream);
        }
        return new Uint8Array(stream.buffer, 8);  // Remove the box header.
      }
    }
    throw "avcC or hvcC not found";
  }
}  

let decoder = null;
self.addEventListener('message', async (e) => {
  if (e.data.method === 'init') {
    decoder = new MP4Decoder(e.data);

  } else if (e.data.method === 'extract') {
    const frames = await decoder.extract(e.data);
    self.postMessage({ method: 'extract', frames, reqId: e.data.reqId }, 
      [ ...frames.map(f => f.data) ]);

  } else if (e.data.method === '') {
    ;
  }
});