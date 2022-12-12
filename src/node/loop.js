import Clip from '../core/clip';

class Loop extends Clip {
  constructor(conf) {
    super({type: 'loop', ...conf});
    this._defaultDuration = NaN;
    this._singleDuration = 0;
  }

  relativeTime(absTime) {
    if (absTime - this.absStartTime > this.duration) return absTime;
    if (this._singleDuration > 0) {
      const nodeTime = absTime - this.absStartTime;
      absTime = this.absStartTime + (nodeTime % this._singleDuration);
    }
    return absTime;
  }

  annotate(record) {
    const { allNodes } = this;
    let maxAbsEnd = Math.max(...allNodes
      .filter(x => !x.isVirtual && !x.flexibleDuration)
      .map(x => x.realAbsEndTime));
    if (!maxAbsEnd) {
      maxAbsEnd = Math.max(...allNodes
        .filter(x => !x.isVirtual)
        .map(x => x.realAbsEndTime));
    }
    this._singleDuration = maxAbsEnd - this.absStartTime;
    const times = this.getConf('times', false);
    if (isFinite(maxAbsEnd) && times > 0) {
      this._defaultDuration = this._singleDuration * times;
    } else {
      this._defaultDuration = '100%';
    }
    super.annotate(record);
  }

  get flexibleDuration() {
    return this._defaultDuration && `${this._defaultDuration}`.endsWith('%');
  }

  get default() {
    const _default = { startTime: super.default.startTime };
    if (this.flexibleDuration) _default.endTime = '100%';
    else _default.duration = this._defaultDuration;
    return _default;
  }

}

export default Loop;