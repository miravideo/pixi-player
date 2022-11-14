
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
  constructor(url) {
    this.id = Math.random().toString(36).substr(-8) + Math.random().toString(36).substr(-8);
    this.url = url;
    this.ready = false;
    this._extractcallbacks = [];
    this.kfs = [];
    this._frameTimer = {};

    this.videoDecoder = new VideoDecoder({
      output: (frame) => this.output(frame),
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

  async extract({ start, end }) {
    return new Promise((resolve, reject) => {
      this._extractcallbacks.push({ start, end, resolve, reject });
      this.extractNext();
    });
  }

  extractNext() {
    if (this.extracting) return false;
    const item = this._extractcallbacks.shift();
    if (!item) {
      this.extracting = false;
      this.extractingRequest = null;
      this.videoFrames = [];
      return;
    }
    try {
      this.file.flush();
      this.file.stop();
      this._extractStart = performance.now();
      this.extracting = true;
      this.extractingRequest = item;
      this.videoFrames = [];
      let start = item.start;
      // todo: 其实没必要...
      for (const kf of this.kfs) {
        if (kf > item.start) break;
        start = kf;
      }
      // console.log('extractNext start', start, this.kfs);
      this.file.setExtractionOptions(this.vtrackId, 'video', { nbSamples: 100 });
      this.file.seek(start, true);
      this.file.start();
    } catch (err) {
      this.extracting = false;
      this.extractingRequest = null;
      item.reject(err);
      this.fetchNext();
    }
  }

  async output(frame) {
    // console.log('output', frame.timestamp, this.extractingRequest);
    // if (!this.extractingRequest) return frame.close();

    const { start, end, resolve, reject } = this.extractingRequest;
    let { width, height } = this.meta;

    const t = frame.timestamp / 1e6;
    // console.log('frame', t, frame.format, frame.colorSpace.matrix);
    if (t >= start && t <= end) {
      this.videoFrames.push({ image: this.getImage(frame), t });
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
    const { resolve } = this.extractingRequest;
    // console.log('reset!');
    this.videoDecoder.reset(); // empty decode queue
    this.videoDecoder.configure(this.vconfig);
    this.extracting = false;
    console.log('worker extract cost:', performance.now() - this._extractStart);
    resolve(this.videoFrames);
    this.extractNext();
  }

  onSamples(track_id, type, samples) {
    const last = samples[samples.length - 1];
    const lastTime = last.cts / last.timescale;
    // console.log('sample', last.cts / last.timescale, this.meta.duration);
    if (!this.extractingRequest) {
      if (track_id === this.vtrackId) {
        for (const sample of samples) {
          if (sample.is_sync) this.kfs.push(sample.cts / sample.timescale);
        }
        // -0.1是为了避免最后缺帧
        if (lastTime >= this.meta.duration - 0.1) {
          this.meta.keyframes = this.kfs.length;
          this.meta.lastFrame = lastTime;
          // console.log('probe done!!', this.kfs.length, performance.now() - this._probeStart);
          self.postMessage({ method: 'ready', meta: this.meta });
        }
      }
      return;
    }

    // console.log('sss', this.id, this.extractingRequest, samples.length);

    // Generate and emit an EncodedVideoChunk for each demuxed sample.
    for (const sample of samples) {
      const t = sample.cts / sample.timescale;
      // video
      if (track_id === this.vtrackId) {
        // console.log('decode.in', t, sample.is_sync);
        this.videoDecoder.decode(new EncodedVideoChunk({
          type: sample.is_sync ? "key" : "delta",
          timestamp: 1e6 * sample.cts / sample.timescale,
          duration: 1e6 * sample.duration / sample.timescale,
          data: sample.data
        }))

      // audio
      } else if (track_id === this.atrackId) {
        ;
      }
    }

    // 必须要调用，否则会有一些在queue里的出不来
    this.file.stop();
    this.videoDecoder.flush().catch(e => {}).finally(() => {
      this.extractFinish();
    });
    // console.log('flush!!');
  }

  onReady(info) {
    // video decoder config
    const vtrack = info.videoTracks[0];
    // console.log('ready!', info);

    this.vconfig = {
      codec: vtrack.codec,
      codedHeight: vtrack.video.height,
      codedWidth: vtrack.video.width,
      description: this.videoDescription(vtrack),
    };
    this.videoDecoder.configure(this.vconfig);
    this.vtrackId = vtrack.id;

    // todo: audio decoder config
    const { width, height } = vtrack.video;
    const frames = vtrack.nb_samples;
    const duration = vtrack.duration / vtrack.timescale;
    const fps = (frames / duration).toFixed(6);
    this.meta = { width, height, frames, duration, fps };

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
    decoder = new MP4Decoder(e.data.url);

  } else if (e.data.method === 'extract') {
    const frames = await decoder.extract(e.data);
    self.postMessage({ method: 'extract', frames }, [ ...frames.map(f => f.image) ]);

  } else if (e.data.method === '') {
    ;
  }
});