import DateUtil from "../util/date";
import AudioUtil from "../util/audio";

const DEFAULT_TIME = -1;

class Material {
  constructor(node) {
    this.forceTrim = false;
    this.node = node;
    this.info = {};
    this.parseTimeConf();
  }

  static playing($el) {
    return !!($el.currentTime > 0 && !$el.paused && !$el.ended && $el.readyState > 2);
  }

  async loadAudioBuffer(onprogress) {
    if (!this.player) return;
    this.audioBuffer = await AudioUtil.getBuffer(this.src, 
      this.player.id, this.player.audioSampleRate, onprogress);
    if (!this.audioBuffer) return;
    this.ach0 = this.audioBuffer.getChannelData(0);
    this.ach1 = this.audioBuffer.numberOfChannels >= 2 ? this.audioBuffer.getChannelData(1) : ch0;
  }

  get src() {
    return this.node && (this.node.getConf('cachedSrc') || this.node.getConf('src'));
  }

  get duration() {
    return this.node && this.node.duration;
  }

  get speed() {
    return this.node && this.node.getConf('speed');
  }

  get volume() {
    return this.node && this.node.getConf('volume');
  }

  get fps() {
    return this.player?.fps;
  }

  get player() {
    return this.node?.player;
  }

  get length() {
    return this.info?.duration;
  }

  get playrate() {
    return this.player?.playbackRate * this.speed;
  }

  matTime(nodeTime) {
    const duration = this.getDuration();
    const loop = this.node.getConf('loop');
    const speed = this.node.getConf('speed');
    let loops = 0;
    let time = nodeTime;
    while (loop && time >= duration) {
      time = Math.max(0.0, time - duration);
      loops++;
    }

    const mt = time * this.speed + this.getStartOffset();
    const min = this.forceTrim ? this.getStartOffset() : 0.01; // 0会导致黑屏
    const max = this.forceTrim ? this.getEndOffset() : this.length;
    const overflow = (mt < min || mt > max);
    time = Math.min(max, Math.max(min, mt));
    return { time, loops, overflow };
  }

  parseTimeConf() {
    this.start = this.parseTimeNumber(this.node.getConf('ss'));
    this.end = this.parseTimeNumber(this.node.getConf('to'));
  }

  parseTimeNumber(time) {
    if (typeof time === 'string' && time.includes(':')) return DateUtil.hmsToSeconds(time);
    time = Number(time)
    return isNaN(time) ? DEFAULT_TIME : time;
  }

  getStartOffset() {
    return this.start == DEFAULT_TIME ? 0 : this.start;
  }

  getEndOffset(withConainer=false) {
    const ends = [];
    const end = this.getStartOffset() + (this.duration * this.speed);
    if (withConainer && !isNaN(end)) ends.push(end);
    if (!isNaN(this.length)) ends.push(this.length);
    if (this.end !== DEFAULT_TIME) ends.push(this.end);
    return ends.length > 0 ? Math.min(...ends) : NaN;
  }

  getDuration(withContainer=false) { // return dest duration time
    return Math.max(0, this.getSourceDuration(withContainer) / this.speed);
  }

  getSourceDuration(withContainer) {
    return this.getEndOffset(withContainer) - this.getStartOffset()
  }

  getAudioFrame(nodeTime, frameSize) {
    if (!this.audioBuffer || this.audioBuffer.numberOfChannels <= 0) return null;
    const { audioSampleRate } = this.player;
    frameSize = frameSize || Math.round(audioSampleRate / this.fps);
    const { time, loops, overflow } = this.matTime(nodeTime);
    const start = Math.round(time * audioSampleRate);

    // todo: 没有处理变速的问题！！
    const buffer = this.player.audioContext.createBuffer(2, frameSize, audioSampleRate);
    buffer.getChannelData(0).set(this.ach0.slice(start, start + frameSize));
    buffer.getChannelData(1).set(this.ach0.slice(start, start + frameSize));
    return buffer;
  }

  destroy() {
    this.destroied = true;
    this.node = null;
    this.audioBuffer = null;
    this.info = null;
  }
}

export default Material;