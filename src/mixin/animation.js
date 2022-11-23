import PluginUtil from '../util/plugin';
import KeyFrames from '../util/keyframe';

const AnimationNode = {
  // keyframe: null,
  initHook(obj) {
  },
  parseAudioMotion() {
    const attr = {};
    const audioData = this.creator().audioData;
    const aMotion = {...this.getConf('amotion')};
    for (let [key, value] of Object.entries(aMotion)) {
      const results = value.match(/(?<={)(.*?)(?=})/g);
      if (results) {
        for (const result of results) {
          value = value.replace(`{${result}}`, `audioData['${result}']`);
        }
        attr[key] = eval(value);
      }
    }
    return attr
  },
  defaultAmotionAttr(args) {
    const {key, minFrequency=0, maxFrequency=1024, amp = 1, threshold = 0, dataType, smooth=0} = args;
    if (!key || !dataType || (maxFrequency <= minFrequency)) return
    if (!this.lastAudioData) {
      this.lastAudioData = {}
    }
    let data;
    if (minFrequency || maxFrequency) {
      const result = this.player.audioAnalyser.slice(minFrequency, maxFrequency);
      if (result) data = result[dataType]
    } else {
      data = this.player.audioAnalyser[dataType];
    }
    if (!data) return
    if (data >= threshold) {
      const {key:_key, value} = this.toAbs(key, amp * data)
      const newValue = value * (1 - smooth) + (this.lastAudioData[_key] || 0) * smooth;
      this.lastAudioData[_key] = newValue;
      return {[_key]: newValue}
    }
  },
  /**
   * 用于将conf中d-开头的相对值转为绝对值
   * @param key
   * @param newValue
   * @param _attr 作为相对基准的attr
   * @returns {{value: number, key: string, relative: boolean}}
   */
  toAbs(key, newValue, _attr=null) {
    let oriValue = (_attr && _attr[key] !== undefined) ? _attr[key]: this.getConf(key);
    let result, relative = false;
    if (key.includes('d-')) {
      key = key.replace('d-', '');
      let oriValue = (_attr && _attr[key] !== undefined) ? _attr[key]: this.getConf(key);
      // relative用来标识是否为相对值，处理相对值和绝对值同时存在的情况
      relative = true;
      if (KeyFrames.D_LIST.includes(key)) {
        // 透明度和scale一直是相对值
        result = oriValue * newValue;
      } else {
        result = oriValue + newValue;
      }
    } else {
      if (KeyFrames.D_LIST.includes(key)) {
        result = oriValue * newValue;
      } else {
        result = newValue;
      }
    }
    return {relative, key, value: result};
  }
};

export default AnimationNode;