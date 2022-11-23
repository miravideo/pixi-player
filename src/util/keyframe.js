const functions = require("js-easing-functions");

class KeyFrame {
  constructor({startTime, endTime, from, to, key, func}) {
    this.startTime = (startTime !== undefined)? startTime : 0;
    this.endTime = endTime;
    this.from = (from !== undefined)? from : to;
    this.to = to;
    this.key = key;
    this.func = (func && functions[func]) || this.default;
  }

  default(t, from, delta, duration) {
    return from + delta * (t / duration);
  }

  get(t) {
    const duration = (this.endTime - this.startTime);
    if (duration <= 0) return this.to;
    return this.func((t - this.startTime) * 1000, this.from, (this.to - this.from), duration * 1000)
  }

  destroy() {
    this.func = null;
    this.from = null;
    this.to = null;
  }
}

class KeyFrames {
  static D_LIST = ['scale', 'opacity', 'volume'];

  constructor(conf) {
    this.conf = conf;
    this.keyFrames = {};
    this.parse();
  }

  /**
   *
   * @param key 需要关键帧动画变化的key
   * @param value 关键帧动画的值, 例如x为300
   * @param index 关键帧的index
   * @param time 关键帧的时间
   * @param func 关键帧动画func的名字
   * @returns {KeyFrame}
   */
  keyFrame(key, value, index, time, func) {
    let from = undefined, startTime = 0;
    for (let i = index - 1; i >= 0; i--) {
      // 一直找到上一个设置它的值
      if (this.conf[i] && this.conf[i][key] !== undefined) {
        from = this.conf[i][key];
        startTime = this.conf[i].time;
        break;
      }
    }
    const conf = {startTime, endTime: time, to: value, key, from, func};
    return new KeyFrame(conf)
  }

  parse() {
    return this.conf.sort((a, b) => a.time - b.time).map((item, index) => {
      Object.entries(item).forEach(([key, value]) => {
        if (['time', 'innerHTML', 'type', '_nodeName'].includes(key)) return;
        const keyFrame = this.keyFrame(key, value, index, item.time, item.easing);
        if (!this.keyFrames[key]) {
          this.keyFrames[key] = [];
        }
        this.keyFrames[key].push(keyFrame);
      })
    })
  }

  update(conf) {
    this.conf = conf;
    this.parse();
  }

  renderAttr(t, node) {
    const attr = {};
    for (let [key, keyFrames] of Object.entries(this.keyFrames)) {
      let newValue;
      for (const keyFrame of keyFrames) {
        if (keyFrame.startTime <= t && t < keyFrame.endTime) {
          newValue = keyFrame.get(t);
          break;
        }
      }

      // 第一个keyframe之前坐标和第一个keyframe的值一样，最后一个和最后一个keyframe的值一样
      if (newValue === undefined && keyFrames.length > 0) {
        if (t < keyFrames[0].startTime) {
          newValue = keyFrames[0].from;
        } else {
          newValue = keyFrames[keyFrames.length -1].to;
        }
      }

      if (newValue !== undefined) {
        const {relative, key: newKey, value} = node.toAbs(key, newValue);
        if (attr[newKey] !== undefined && relative) continue; // 如果有绝对坐标的话，以绝对坐标为准
        attr[newKey] = value;
      }
    }

    return attr;
  }

  destroy() {
    if (this.keyFrames) Object.values(this.keyFrames).map(kfs => {
      kfs && Array.isArray(kfs) && kfs.map(kf => kf.destroy());
    });
    this.keyFrames = null;
    this.conf = null;
  }
}

module.exports = KeyFrames;
