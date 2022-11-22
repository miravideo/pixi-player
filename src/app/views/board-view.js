'use strict';

require('../styles/board.less');
const Point = require('../utils/point');
const { secToHmsf, secToHms } = require('../utils/time');
const MiraEditorBase = require('./base-view');
const RectUtil = require('../utils/rect');
const { SELECT } = require('../utils/static');
const { round } = require('../utils/math');

const TRACK_HEAD_SIZE = 120;

class MiraBoardView extends MiraEditorBase {
  static TAG = 'mira-editor-board';

  init() {
    this.addClass('mirae-board');
    this.cursor = {};
    this.cursorTime = {};
    this.onscroll = (e) => this.onScroll(e);
    return super.init();
  }

  setHead(show) {
    this.trackHeadWidth = TRACK_HEAD_SIZE;
    if (!show) this.addClass('no-head');
    return this.setStyleVars({ '--trackHeadWidth': `${this.trackHeadWidth}px` });
  }

  addEndCover() {
    if (!this.videoEndCover) {
      this.videoEndCover = document.createElement('div');
      this.videoEndCover.classList.add('video-end-cover');
    }
    this.ruler.append(this.videoEndCover);
  }

  addMoveListener(listener) {
    super.addMoveListener(listener);
    this.addEventListener('mousewheel', (e) => {
      if (!e.mctrlKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (listener && listener.onScale) {
        const delta = e.wheelDelta % 120 == 0 ? e.wheelDelta : (e.wheelDeltaX || e.wheelDeltaY);
        listener.onScale(listener.relativeScale + (delta > 0 ? 0.01 : - 0.01));
      }
    });
    return this;
  }

  onScroll(e) {
    this.updateClipScroll();
    this.moveListener.onScroll(e);
  }

  updateClipScroll() {
    for (const track of this.childNodes) {
      if (!track.classList.contains('mirae-track')) continue;
      for (const clip of track.childNodes) {
        if (clip.onScroll) clip.onScroll({x: this.scrollLeft - this.trackHeadWidth, y: this.scrollTop});
      }
    }
  }

  pointerTime(event) {
    const x = event instanceof Point ? event.x : this.eventPoint(event).x;
    return (x - this.trackHeadWidth) / this.scale;
  }

  eventPoint(event) {
    return this.rebase(new Point(event));
  }

  rebase(p) {
    const scroll = [-this.scrollLeft, -this.scrollTop];
    return p.rebase(this).rebase(scroll);
  }

  relativeRect(rect) {
    const scroll = [-this.scrollLeft, -this.scrollTop];
    if (rect.nodeType === 1 && rect.getBoundingClientRect) {
      rect = rect.getBoundingClientRect();
    }
    return rect.rebase(this.getBoundingClientRect()).rebase(scroll);
  }

  selection(start, end) {
    if (!start || !end) {
      this.selectionBox && this.selectionBox.remove();
      this.selectionBox = null;
      return;
    }

    const rect = this.rebase(RectUtil.bounds([start, end]));
    if (!this.selectionBox) {
      this.selectionBox = document.createElement('div');
      this.selectionBox.classList.add('mirae-board-selection');
      this.append(this.selectionBox);
      this.selected = {};
    }

    for (const k of ['top', 'left', 'width', 'height']) {
      this.selectionBox.style[k] = `${rect[k]}px`;
    }

    if (this.rendering) return;
    this.rendering = true;
    requestAnimationFrame(() => {
      const selected = {};
      for (const track of this.childNodes) {
        if (!track.classList.contains('mirae-track')) continue;
        for (const clip of track.childNodes) {
          if (!clip.node?.id || clip.node.type === 'placeholder') continue; // 可能有非clip的view
          if (RectUtil.intersect(rect, this.relativeRect(clip))) {
            selected[clip.node.id] = clip.node;
          }
        }
      }

      const diff = [];
      Object.entries(selected).map(([nodeId, node]) => {
        if (!this.selected[nodeId]) diff.push(node);
      });
      Object.entries(this.selected).map(([nodeId, node]) => {
        if (!selected[nodeId]) diff.push(node);
      });

      if (diff[0]) diff[0].emit(SELECT, { action: 'multi', nodes: diff });
      this.selected = selected;
      this.rendering = false;
    });
  }

  setScale(scale) {
    this.scale = scale;
    // update cursor
    for (const [k, c] of Object.entries(this.cursor)) {
      if (!c.parentNode) continue;
      c.style.left = `${this.cursorTime[k] * this.scale}px`;
    }
    this.refreshEndCover(false);
  }

  get ruler() {
    if (this._ruler) return this._ruler;
    for (const track of this.childNodes) {
      if (track.classList.contains('ruler')) {
        this._ruler = track;
        break;
      }
    }
    return this._ruler;
  }

  showCursor(key, time, forceFrame=true, forceRange=true) {
    if (forceRange) time = Math.max(Math.min(time, this.duration), 0);
    if (forceFrame) time = Math.floor(time * this.fps) / this.fps;
    else time = Math.floor(time * 100) / 100;
    time = round(time, 3);
    this.cursorTime[key] = time;
    if (!this.cursor[key]) {
      this.cursor[key] = document.createElement('div');
      this.cursor[key].classList.add(key);
    }
    if (!this.cursor[key].parentNode) {
      this.ruler.append(this.cursor[key]);
    }
    this.cursor[key].style.left = `${time * this.scale}px`;
    this.cursor[key].setAttribute('data-time', secToHms(time, 1, true));
    return time;
  }

  flashCursor(key, klass, time=500) {
    if (!this.cursor[key]) return;
    this.cursor[key].classList.add(klass);
    this.lock(time, () => {
      this.cursor[key].classList.remove(klass);
    }, `FlashCursor:${key}`);
  }

  scrollToCursor(key) {
    if (!this.parentElement) return;
    const x = this.cursorTime[key] * this.scale;
    if (!this.cursor[key] || !this.cursor[key].parentNode || this.locked('scroll') || (
      this.scrollLeft <= x && x <= this.scrollLeft + this.parentElement.offsetWidth
    )) return;
    this.lock(2000, null, 'scroll');
    this.cursor[key].scrollIntoView({ behavior: "smooth", block: 'center', inline: 'start' });
  }

  hideCursor(key) {
    if (!this.cursor[key]) return;
    this.cursor[key].remove();
    delete this.cursor[key];
  }

  showConstraint(related) {
    if (this.constraint && this.constraint != related) this.hideConstraint();
    this.constraint = related;
    this.showCursor('constraint', related.time - this.root.absStartTime, false, false);
    if (this.constraint.clip) this.constraint.clip.view.addClass('constraint-related');
  }

  hideConstraint() {
    this.hideCursor('constraint');
    if (!this.constraint) return;
    if (this.constraint.clip) this.constraint.clip.view.removeClass('constraint-related');
  }

  setDuration(duration) {
    this.duration = duration;
    this.refreshEndCover();
  }

  refreshEndCover(animation=true) {
    if (animation && this.videoEndCover) {
      this.videoEndCover.classList.add('animation');
      this.lock(500, () => {
        this.videoEndCover.classList.remove('animation');
      }, 'end-cover-ani');
    }
    this.setStyleVars({ '--endLeft': `${1 + (this.duration * this.scale)}px` });
  }

  setWidth(width) {
    this.setStyleVars({ '--maxWidth': width });
  }

  setHeight(height) {
    this.setStyleVars({ '--boardHeight': `${height}px` });
  }

  scrollToVisible(e) {
    const point = this.eventPoint(e);
    const d = 8, m = 30;
    const [left, top, tw, th] = [this.scrollLeft, this.scrollTop, this.scrollWidth, this.scrollHeight];
    const [width, height] = [this.parentElement.offsetWidth, this.parentElement.offsetHeight];
    const delta = { x: 0, y: 0 };
    if (point.x < left + d && left > 0) { // scroll left
      delta.x = - Math.min(m, left);
    } else if (point.x > left + width - d && left + width < tw) { // scroll right
      delta.x = Math.min(m, tw - (left + width));
    }
    if (point.y < top + d && top > 0) { // scroll top
      delta.y = - Math.min(m, top);
    } else if (point.y > top + height - d && top + height < th) { // scroll bottom
      delta.y = Math.min(m, th - (top + height));
    }
    this.scrollTo({ top: top + delta.y, left: left + delta.x, behavior: 'auto' });
    return delta;
  }

  remove() {
    this.root = null;
    super.remove();
  }

}

MiraBoardView.register();
module.exports = MiraBoardView;