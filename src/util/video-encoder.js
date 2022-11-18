
const TIME_SCALE = 90000;
const MICRO_SECOUND = 1e6;
const BR_MAP = { 
  low: { v: 0.02, a: 96000 }, 
  default: { v: 0.04, a: 128000 },
  high: { v: 0.06, a: 192000 },
};

const randId = () => {
  return Math.random().toString(36).substr(-8) + Math.random().toString(36).substr(-8);
}

class MP4Encoder {
  constructor(opts) {
    this.id = randId();
    this.opts = opts;
    const { fps, duration } = opts;

    this.file = MP4Box.createFile();
    this.file.init({
      timescale: TIME_SCALE,
      duration: duration * TIME_SCALE,
      brands: ['isom', 'iso2', 'avc1', 'mp41'],
    });

    // fix this issue: https://github.com/gpac/mp4box.js/pull/301
    this.file._createSingleSampleMoof = this.file.createSingleSampleMoof.bind(this.file);
    this.file.createSingleSampleMoof = function(sample) {
      const moof = this._createSingleSampleMoof(sample);
      moof.trafs[0].tfdt.set("baseMediaDecodeTime", sample.dts);
      return moof;
    }

    const tick = 1 / fps;
    this.tduration = MICRO_SECOUND * tick;
    this.endTime = 0;

    this.initVideoEncoder();
    this.initAudioEncoder();
  }

  initVideoEncoder() {
    const { fps, width, height, duration, quanlity, bitrate } = this.opts;
    const br = BR_MAP[quanlity] || BR_MAP.default;

    const encoderOptions = {
      codec: "avc1.640834", // High
      width, height,
      avc: { format: "avc" }, // annexb
      hardwareAcceleration: "prefer-hardware",
      // There is a bug on macOS if this is greater than 30 fps
      // framerate: fps, // 其实encoder应该不管fps啊，每帧都有timestamp和duration的
      bitrate: bitrate || Math.round(width * height * fps * br.v),
    }

    const trackOptions = {
      name: "Video created with PIXI-Player",
      language: 'und',
      width, height,
      timescale: TIME_SCALE,
    };

    // todo: encoder偶尔会出错，需要catch住错误？
    let videoTrack = null;
    const videoEncoder = new VideoEncoder({
      output: (chunk, config) => {
        if (videoTrack == null) {
          trackOptions.avcDecoderConfigRecord = config.decoderConfig.description;
          videoTrack = this.file.addTrack(trackOptions);
        }
        const sample = this.addSample(videoTrack, chunk, { duration: this.tduration });
        this.endTime = Math.max(sample.cts + sample.duration, this.endTime);
      },
      error: (e) => console.error(e),
    });
    videoEncoder.configure(encoderOptions);
    this.videoEncoder = videoEncoder;
  }

  initAudioEncoder() {
    const { fps, audioSampleRate, numberOfChannels, duration, quanlity } = this.opts;
    const br = BR_MAP[quanlity] || BR_MAP.default;

    const encorderOptions = {
      // https://www.w3.org/TR/webcodecs-aac-codec-registration/
      codec: "mp4a.40.2", // mp4a.40.2 — MPEG-4 AAC LC 
      sampleRate: audioSampleRate,
      numberOfChannels: numberOfChannels,
      bitrate: br.a,
      aac: { format: "aac" } 
    }

    const trackOptions = {
      name: "Audio created with PIXI-Player",
      // name: 'SoundHandler',
      samplerate: audioSampleRate,
      timescale: TIME_SCALE,
      channel_count: numberOfChannels,
      hdlr: 'soun',
      type: 'mp4a',
    };

    let audioTrack = null;
    const audioEncoder = new AudioEncoder({
      output: (chunk, opts) => {
        if (!audioTrack) audioTrack = this.file.addTrack(trackOptions);
        this.addSample(audioTrack, chunk, {});
      },
      error: (e) => console.error(e),
    });
    audioEncoder.configure(encorderOptions);
    this.audioEncoder = audioEncoder;
  }

  addSample(track, chunk, opts) {
    const buffer = new ArrayBuffer(chunk.byteLength);
    chunk.copyTo(buffer);
    opts.duration = Math.round(TIME_SCALE * ((chunk.duration || opts.duration) / MICRO_SECOUND));
    opts.dts = Math.round(TIME_SCALE * (chunk.timestamp / MICRO_SECOUND));
    opts.cts = opts.dts;
    opts.is_sync = chunk.type === 'key';
    return this.file.addSample(track, buffer, opts);
  }

  async encode(data) {
    let res;
    if (data.type === 'audio') {
      res = await this.encodeAudio(data);
    } else if (data.type === 'video') {
      res = await this.encodeVideo(data);
    }
    if (data.buffer.close) data.buffer.close();
    return res;
  }

  async encodeVideo({ timestamp, keyFrame, flush, buffer }) {
    const vframe = new VideoFrame(buffer, { 
      timestamp, 
      duration: this.tduration,
      alpha: "discard",
    });
    try {
      this.videoEncoder.encode(vframe, { keyFrame });
      if (flush) await this.videoEncoder.flush();
      return true;
    } catch (e) {
      return false;
    } finally {
      vframe.close();
    }
  }

  async encodeAudio({ timestamp, samples, buffer }) {
    const { audioSampleRate, numberOfChannels } = this.opts;
    const aframe = new AudioData({
      format: "f32-planar",
      sampleRate: audioSampleRate,
      numberOfChannels: numberOfChannels,
      numberOfFrames: samples,
      timestamp,
      data: new Float32Array(buffer)
    });
    try {
      // audioEncoder中途不能flush，否则会重叠
      this.audioEncoder.encode(aframe);
      return true;
    } catch (e) {
      return false;
    } finally {
      aframe.close();
    }
  }

  async flush(type) {
    await this.videoEncoder.flush();
    await this.audioEncoder.flush();
    this.file.moov.mvhd.duration = this.endTime;
    return this.file.getBuffer();
  }
}

let encoder = null;
self.addEventListener('message', async (e) => {
  if (e.data.method === 'init') {
    encoder = new MP4Encoder(e.data);
    self.postMessage({ method: 'init', reqId: e.data.reqId });
  } else if (e.data.method === 'encode') {
    const res = await encoder.encode(e.data);
    self.postMessage({ method: 'encode', reqId: e.data.reqId, res });
  } else if (e.data.method === 'flush') {
    const buffer = await encoder.flush(e.data.type);
    self.postMessage({ method: 'flush', reqId: e.data.reqId, buffer }, [buffer]);
  }
});

