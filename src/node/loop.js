import Clip from '../core/clip';
import STATIC from '../core/static';

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

  async draw(absTime, type) {
    if (!this.onDraw(absTime)) return;
    const playing = (type === STATIC.VIEW_TYPE_PLAY);
    const relTime = this.relativeTime(absTime);
    const dt = relTime - this._singleDuration;
    if (-1 < dt && dt < 0 && playing) {
      const _absTime = this.absStartTime + dt;
      this.allNodes.map(n => {
        // 正在渲染中的video，不要prepare，避免冲突
        if (n.type !== 'video' || n.onDraw(relTime)) return;
        const _dt = _absTime - n.absDrawStartTime;
        if (-1 < _dt && _dt < 0) {
          n.material.prepare(n.absDrawStartTime - n.absStartTime, type);
          // console.log('draw prepare', n.id, {_dt, absTime, _absTime});
        }
      });
    }
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