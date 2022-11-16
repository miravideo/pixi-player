
const ONE_SECOND_IN_MICROSECOND = 1000000;
const BR_MAP = { 
  low: { v: 0.01, a: 96000 }, 
  default: { v: 0.02, a: 128000 },
  high: { v: 0.04, a: 192000 },
};

const randId = () => {
  return Math.random().toString(36).substr(-8) + Math.random().toString(36).substr(-8);
}

class MP4Encoder {
  constructor(opts) {
    this.id = randId();
    this.opts = opts;
    this.file = MP4Box.createFile();

    const tick = 1 / opts.fps;
    this.tduration = ONE_SECOND_IN_MICROSECOND * tick;

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
      timescale: ONE_SECOND_IN_MICROSECOND,
      width, height,
      nb_samples: Math.floor(duration * fps),
      media_duration: duration,
      brands: ['isom', 'iso2', 'avc1', 'mp41'],
    };

    const sampleOptions = {
      duration: this.tduration,
      dts: 0,
      cts: 0,
      is_sync: false,
    };

    let videoTrack = null;
    const videoEncoder = new VideoEncoder({
      output: (chunk, config) => {
        if (videoTrack == null) {
          trackOptions.avcDecoderConfigRecord = config.decoderConfig.description;
          videoTrack = this.file.addTrack(trackOptions);
        }
        this.addSample(videoTrack, chunk, sampleOptions);
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
      timescale: ONE_SECOND_IN_MICROSECOND,
      duration: duration,
      media_duration: duration,
      channel_count: numberOfChannels,
      hdlr: 'soun',
      type: 'mp4a',
    };

    const sampleOptions = {
      duration: 0,
      dts: 0,
      cts: 0,
      is_sync: false,
    };

    let audioTrack = null;
    const audioEncoder = new AudioEncoder({
      output: (chunk, opts) => {
        if (!audioTrack) audioTrack = this.file.addTrack(trackOptions);
        this.addSample(audioTrack, chunk, sampleOptions);
      },
      error: (e) => console.error(e),
    });
    audioEncoder.configure(encorderOptions);
    this.audioEncoder = audioEncoder;
  }

  addSample(track, chunk, opts) {
    const buffer = new ArrayBuffer(chunk.byteLength);
    chunk.copyTo(buffer);
    opts.duration = chunk.duration || opts.duration;
    opts.dts = chunk.timestamp;
    opts.cts = chunk.timestamp;
    opts.is_sync = chunk.type === 'key';
    this.file.addSample(track, buffer, opts);
    // console.log('addSample', track, chunk.timestamp);
  }

  async encode(data) {
    if (data.type === 'audio') {
      await this.encodeAudio(data);
    } else if (data.type === 'video') {
      await this.encodeVideo(data);
    }
    if (data.buffer.close) data.buffer.close();
  }

  async encodeVideo({ timestamp, keyFrame, flush, buffer }) {
    const vframe = new VideoFrame(buffer, { 
      timestamp, 
      duration: this.tduration,
      alpha: "discard",
    });
    this.videoEncoder.encode(vframe, { keyFrame });
    if (flush) await this.videoEncoder.flush();
    vframe.close();
  }

  async encodeAudio({ timestamp, samples, buffer }) {
    const { audioSampleRate, numberOfChannels } = this.opts;
    const aframe = new AudioData({
      format: "f32-planar",
      sampleRate: audioSampleRate,
      numberOfChannels: numberOfChannels,
      numberOfFrames: samples,
      timestamp: timestamp,
      data: new Float32Array(buffer)
    });
    // audioEncoder中途不能flush，否则会重叠
    this.audioEncoder.encode(aframe);
    aframe.close();
  }

  async flush(type) {
    await this.videoEncoder.flush();
    await this.audioEncoder.flush();
    return this.file.getBuffer();
  }
}

let encoder = null;
self.addEventListener('message', async (e) => {
  if (e.data.method === 'init') {
    encoder = new MP4Encoder(e.data);
    self.postMessage({ method: 'init', reqId: e.data.reqId });
  } else if (e.data.method === 'encode') {
    await encoder.encode(e.data);
    self.postMessage({ method: 'encode', reqId: e.data.reqId });
  } else if (e.data.method === 'flush') {
    const buffer = await encoder.flush(e.data.type);
    self.postMessage({ method: 'flush', reqId: e.data.reqId, buffer }, [buffer]);
  }
});

