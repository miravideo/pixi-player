'use strict';

require('../styles/clip.less');
const AudioUtil = require('../utils/audio');
const { uuid, short } = require('../utils/data');
const { round } = require('../utils/math');
const Queue = require('../utils/queue');
const { OP_START, OP_END, CHANGING, MAX, OP_CHANGE, OP_MOVE, TYPE_SPINE } = require('../utils/static');
const { secToHmsf, secToHms } = require('../utils/time');
const MiraEditorBase = require('./base-view');
const MiraButton = require('./button-view');
const MiraClipHandle = require('./clip-handle-view');
const MiraClipPLine = require('./clip-parent-view');

const FRAME_CACHE = {};
const FRAME_HEIGHT = 120;
const MIN_RESIZE_WIDTH = 15;

const imgReady = (img, callback) => {
  if (img.complete) return callback(img);
  img.onload = () => callback(img);
}

class MiraClipView extends MiraEditorBase {
  static TAG = 'mira-editor-clip';

  init() {
    super.addClass('mirae-clip');
    this.videoQueue = new Queue();
    this.audioQueue = new Queue();
    return super.init();
  }

  addClass(klass, duration) {
    super.addClass(klass, duration);
    this.classChanged();
    return this;
  }

  removeClass(klass) {
    if (!this.hasClass(klass)) return this;
    super.removeClass(klass);
    this.classChanged();
    return this;
  }

  get visible() {
    const [ left, top ] = [ this.offsetLeft, this.parentNode?.offsetTop ];
    const [ w, h ] = [ this.offsetWidth, this.offsetHeight ];
    const [ bw, bh, x, y ] = this.boardSize;
    return bw > 0 && left + w > x && left < x + bw && top + h > y && top < y + bh;
  }

  onScroll({x, y}) {
    const left = this.styleNumber('left');
    const width = this.styleNumber('width');
    if (left - x < 0 && left + width - x > 76) {
      this.setStyleVars({ '--leftOffset': `${x - left}px` });
    } else if (left - x >= 0) {
      this.setStyleVars({ '--leftOffset': `0px` });
    }
    this.updateView();
  }

  setStyle(styles) {
    super.setStyle(styles);
    if (styles.width) this.classChanged();
    else if (styles.left) this.updateParentLines();
    return this;
  }

  setInfo() {
    if (!this.node || !this.node.parent) return;
    let info = '';
    if (this.name) info += `${this.name} `;
    if (this.node.groupId) info += '(已组合) ';
    if (this.node.rootConf) {
      info += ' - 时长: ' + secToHms(this.node.duration, 1, true);
    }
    if (info) this.set('data-info', info);
  }

  classChanged() {
    if (!this.handles) this.handles = {};
    const width = this.styleNumber('width');
    this.setInfo();
    this.addResizeHandles(width);
    if (this.node?.type !== 'text' && this.audioBtn) {
      if (!this.audioBtn.parentNode && width >= 72) {
        this.addAudioBtn();
      } else if (this.audioBtn.parentNode && width < 72) {
        this.audioBtn.hide();
      }
    }
    this.updateParentLines();
  }

  updateParentLines() {
    const pClass = 'hover-parent';
    const hide = () => {
      if (!this.pLineView || !this.pLineView.hasClass('show')) return;
      this.pLineView.removeClass('show');
      if (this.pView) {
        this.pView.removeClass(pClass);
        this.pView = null;
      }
      if (this.unlinkBtn) {
        setTimeout(() => {
          if (!this.hasClass('hover')) this.unlinkBtn.hide();
        }, 10);
      }
    }

    const showParent = this.node && this.node.parent && !this.isShadow 
      && !['creator', 'scene', 'spine', 'track'].includes(this.node?.parent.type);
    if (showParent && this.parentNode) {
      if (!this.pLineView) this.pLineView = MiraClipPLine.create(this);
      this.pView = this.node?.parent?.clip?.view;
      if (this.pView) {
        const y = this.parentNode.offsetTop + this.offsetTop;
        const h = this.offsetHeight;
        const py = this.pView.parentNode.offsetTop + this.pView.offsetTop;
        const ph = this.pView.offsetHeight;

        let hh = h * 0.5;
        let dy = py > y ? (y + hh) - py : (y - hh) - py;
        let dx = 0;
        if (this.node.startTime <= 0) {
          dx = Math.floor(this.node.startTime * this.scale) + 1;
          dy = (y + hh) - (py + (ph * 0.5));
        } else if (this.node.startTime >= this.node.parent.duration) {
          dx = Math.ceil((this.node.startTime - this.node.parent.duration) * this.scale) + 1;
          dy = (y + hh) - (py + (ph * 0.5));
        }
        this.pLineView.update(hh, dx, Math.round(dy));
      }
    }

    if (!showParent || !this.pLineView || !this.hasClass(['hover', 'moving'])) {
      return hide();
    }

    // 暂时不显示unlink
    if (!this.unlinkBtn) {
      this.unlinkBtn = MiraButton.create(this).addClass('unlink-btn');
      this.unlinkBtn.onClick = (e) => {
        const parent = this.node.creator();
        const start = this.node.absStartTime;
        this.apply({ parent, start }, () => {
          this.unlinkBtn.remove();
          this.unlinkBtn = null;
        });
      }
    }

    if (!window.event?.mctrlKey || this.hasClass('selected')) {
      this.unlinkBtn.hide();
    } else if (!this.unlinkBtn.parentNode) {
      this.unlinkBtn.appendTo(this);
    }

    if (!this.pView) return;
    this.pView.addClass(pClass);
    this.pLineView.addClass('show');
  }

  addResizeHandles(width) {
    if (!this.node || this.node.type === 'scene') return;
    if (this.classList.contains('selected') && width > MIN_RESIZE_WIDTH) {
      for (const type of ['start', 'end']) {
        if (!this.handles[type]) this.handles[type] = this.createHandle(type);
        else if (!this.handles[type].parentNode) this.append(this.handles[type]);
      }
    } else { // remove handle
      Object.values(this.handles).map(h => h.hide());
    }
  }

  createHandle(type) {
    return MiraClipHandle.create(this).set('data-type', type)
      .addClass(`mirae-clip-handle-${type}`).addMoveListener(this);
  }

  clear() {
    if (this.cropView) this.cropView.clear();
    if (this.handles.start) this.handles.start.clear();
    if (this.handles.end) this.handles.end.clear();
    super.clear();
  }

  onTimeResizeStart(e) {
    if (!this.cropMode) return;
    this.initProxyState();
  }

  onTimeResizeEnd(e) {
    if (!this.cropMode) return;
    this.node.emit(CHANGING, {action: OP_END});
  }

  onTimeResize(type, delta) {
    if (!this.cropMode) return;
    const to = {};
    const dt = delta.x / this.scale;
    if (type === 'start') {
      this.proxyState.start += dt;
      to.cropStart = this.roundCropTime(this.proxyState.start);
    } else if (type === 'end') {
      this.proxyState.end += dt;
      to.cropEnd = this.roundCropTime(this.proxyState.end);
    }
    this.moveListener.apply({ to }, OP_MOVE);
  }

  onMove(e) {
    if ([this.handles.start, this.handles.end].includes(e.target)
       && this.moveListener.onTimeResize) {
      const type = e.target.get('data-type');
      if ((type === 'start' && e.delta.x > 0) || (type === 'end' && e.delta.x < 0)) {
        // 缩小时，有极值判断，避免太小
        if (this.styleNumber('width') < MIN_RESIZE_WIDTH + 15) return;
      }
      this.moveListener.onTimeResize(type, e.delta);
    } else if (e.target === this.cropView && this.cropMode) {
      if (!this.proxyState) this.initProxyState();
      const board = this.board;
      if (board) { // 自动滚动
        const scrollDelta = board.scrollToVisible(e.event);
        e.delta.x += scrollDelta.x;
      }
      let dt = e.delta.x / this.scale;
      this.proxyState.start += dt;
      this.proxyState.end += dt;
      const cropStart = this.roundCropTime(this.proxyState.start);
      const cropEnd = this.roundCropTime(this.proxyState.end);
      const delta = {to: { cropStart, cropEnd }};
      this.moveListener.apply(delta, OP_MOVE);
    }
  }

  onMoveStart(e) {
    if (this.node.emit) this.node.emit(CHANGING, {action: OP_START});
    this.addClass('moving');
    if ([this.handles.start, this.handles.end].includes(e.target)
       && this.moveListener.onTimeResizeStart) {
      this.moveListener.onTimeResizeStart(e);
    } else if (this.cropMode) {
      this.initProxyState();
    }
  }

  onMoveEnd(e) {
    // hover是为了在的移动完之后保持在比较高的zindex显示
    this.addClass('hover').removeClass('moving');
    if ([this.handles.start, this.handles.end].includes(e.target)
       && this.moveListener.onTimeResizeEnd) {
      this.moveListener.onTimeResizeEnd(e);
    } else if (this.node.cropMode && !e.moved && this.moveListener.onTimeMark) {
      this.moveListener.onTimeMark({ time: this.node.cropStart });
    }
    if (this.node.emit) this.node.emit(CHANGING, {action: OP_END});
  }

  roundCropTime(time) {
    time = Math.floor(time * this.fps) / this.fps;
    time = Math.max(Math.min(time, this.node.duration), 0);
    return time;
  }

  get fps() {
    if (!this._fps) this._fps = this.node.rootConf('fps');
    return this._fps;
  }

  initProxyState() {
    this.proxyState = {
      start: this.node.cropStart,
      end: this.node.cropEnd,
    }
  }

  remove() {
    Object.values(this.handles).map(h => h.remove());
    if (this.audioBtn) this.audioBtn.remove();
    if (this.cropView) this.cropView.remove();
    this.node = null;
    this.root = null;
    super.remove();
  }

  setOpts(opts) {
    const { node, root } = opts;
    this.node = node;
    this.root = root;
    if (opts.shadow) {
      this.isShadow = true;
      this.addClass('shadow');
    } else {
      if (node.id) this.set('id', `mirae-clip-${node.id}`);
      this.addClass('node');
      this.refresh();
    }
    return this;
  }

  setScale(scale) {
    if (!this.node || !this.root) return;
    this.scale = scale;
    this.startTime = this.node.absStartTime;
    if (this.cropView) {
      this.cropView.setScale(scale);
      this.refreshCropShadow();
    }
    return this.updateDuration(true).setStyle({
      top: this.node.type === 'crop' ? '-2px' : '2px',
      left: `${this.scale * (this.node.absStartTime - this.root.absStartTime)}px`
    });
  }

  updateDuration(force=false) {
    if (!force && this.duration == this.node.duration) return;
    this.duration = this.node.duration;
    this.setStyle({ width: `${this.scale * this.node.duration}px`});
    return this.updateView();
  }

  update(force=false) {
    if (!this.node) return this;
    if (force || this.startTime != this.node.absStartTime
              || this.duration != this.node.duration) {
      this.setScale(this.scale);
      if (!this.cropMode && this.node?.parent?.type !== TYPE_SPINE) { // spine里的移动不用高亮
        this.addClass('auto-hover', 500);
      }
    }
    if (force || this.active !== this.node.active) {
      this.active = this.node.active;
      this.toggleClass('disable', !this.active);
      // 解决轨道批量按钮和clipView之间的联动
      if (!this.isShadow) this.refresh();
    }
    this.updateParentLines();
    return this;
  }

  styleNumber(key) {
    return Number(this.style[key].replace('px', ''));
  }

  moveDelta(delta) {
    this.setStyle({ 
      left: `${this.styleNumber('left') + delta.x}px`,
      top: `${this.styleNumber('top') + delta.y}px`
    });
    this.updateParentLines();
    return this;
  }

  apply(to, callback) {
    this.lock(50, () => {
      this.moveListener.applyChange({to});
      if (callback) callback();
    }, 'apply');
  }

  refresh() {
    if (!this.node) return;
    this.name = this.filename();
    const func = this[this.node.type];
    if (func && typeof func === 'function') func.call(this);
    if (this.cropMode) this.addCropView();
    if (this.parentNode?.refresh) this.parentNode.refresh();
    return this.updateView();
  }

  addCropView() {
    if (!this.cropView) {
      const node = { id: `crop-${this.node.id}`, type: 'crop', absStartTime: 0, duration: 0 };
      this.cropView = MiraClipView.create({ node, root: this.root, moveListener: this });
      this.addClass('no-info');
    }
    if (this.cropView.parentNode !== this) this.append(this.cropView);
    this.cropView.node.absStartTime = this.node.cropStart;
    this.cropView.node.duration = this.node.cropEnd - this.node.cropStart;
    this.cropView.update().crop();
    this.refreshCropShadow();
  }

  refreshCropShadow() {
    const scale = this.scale || 1;
    this.setStyleVars({
      '--leftShadow': `${Math.ceil(this.node.cropStart * scale) + 1}px`, 
      '--rightShadow': `${Math.ceil((this.node.duration - this.node.cropEnd) * scale + 1)}px`
    });
  }

  addAudioBtn() {
    if (this.cropMode || !this.node || this.node.audio === undefined) {
      return this.audioBtn?.hide();
    }
    if (!this.audioBtn) {
      this.audioBtn = MiraButton.create(this).addClass('audio-btn');
      this.audioBtn.onClick = (e) => {
        this.apply({ audio: !this.node.audio });
      }
    }
    this.audioBtn.toggleClass('audio-btn-off', !this.node.audio);
    if (this.canvasCtr) this.canvasCtr.append(this.audioBtn);
  }

  filename() {
    return short(this.node.name, 15) || 
      short(this.node.conf.userfile?.name, 20, 5) || 
      this.node.id;
  }

  crop() {
    super.addClass(['crop', 'selected']);
    if (!this.infoLabel) {
      this.infoLabel = document.createElement('div');
      this.infoLabel.classList.add('crop-info-label');
      this.append(this.infoLabel);
    }
    this.infoLabel.innerText = secToHms(this.node.duration, 1);
  }

  image() {
    super.addClass('video');
  }

  gif() {
    super.addClass('video');
    // this.addClass('sticker');
  }

  video() {
    super.addClass('video');
    this.addAudioBtn();
  }

  audio() {
    super.addClass('audio');
    this.addAudioBtn();
    this.active = this.node.active && this.node.audio;
    this.toggleClass('disable', !this.active);
  }

  text() {
    super.addClass('text');
    if (!this.textView) {
      this.textView = document.createElement('div');
      this.textView.classList.add('text-view');
      this.append(this.textView);
    }
    // 只能是innerText，防止XSS攻击
    let text = `${this.node.conf.text}`;
    text = text.trim().replaceAll("\n", ' ').replaceAll("\r", ' ');
    this.textView.innerText = text;
    this.name = short(text, 20);
    // this.name = this.node.id;

    if (this.node.speech) {
      this.updateAudioView();
    } else {
      if (this.preview) this.preview.remove();
    }
  }

  placeholder() {
    super.addClass('placeholder');
    this.innerText = '添加素材, 开始您的创作吧~';
  }

  scene() {
    super.addClass('scene');
    this.addAudioBtn();
  }

  trans() {
    super.addClass('trans');
    this.name = '转场效果 - ' + this.filename();
  }

  mixin() {
    super.addClass('mixin');
    this.name = '特效 - ' + (this.node.name || this.node.mixin);
    this.innerHTML = `<div class="mirae-clip-title">${this.name}</div>`;
  }

  cover() {
    if (this.node.children[0]?.type === 'filter') {
      super.addClass('filter');
      this.name = '滤镜 - ' + (this.node.children[0].name || '自定义');
    } else if (this.node.mask) {
      super.addClass('mask');
      this.name = '蒙版 - ' + (this.node.mask.name || '自定义');
    }
    this.innerHTML = `<div class="mirae-clip-title">${this.name}</div>`;
  }

  updateView() {
    if (this.isShadow) return this;
    if (['video', 'image', 'gif', 'scene'].includes(this.node.type)) {
      this.updatePreview();
    } else if (['audio', 'text'].includes(this.node.type)) {
      this.updateAudioView();
    }
    return this;
  }

  async updateAudioView() {
    const mat = this.node.material;
    if (!mat) return;
    const src = mat.path;
    const { duration, data } = await this.audioData(src);
    if (!this.visible) return;

    const height = 40;
    let styles = [
      { color: '#1abc9c', h: 0},
      { color: '#F8DD0B', h: 0.6 * height },
      { color: '#EE3333', h: 0.8 * height },
    ];
    if (this.node.type === 'text') {
      styles = [ { color: this.node.audio ? '#166C96' : '#334455', h: 0} ];
    }

    const { left, width, clipWidth } = this.renderPreviewCanvas(height);
    if (!left && !width) return;

    // 映射到data的index, start/end/len
    const volume = this.node.volume;
    const speed = mat.speed || 1;
    const matStart = mat.getStartOffset(); // src start
    const matDur = mat.getDuration() * speed; // 这里的getDuration是变速过的时长, 但我们需要src duration
    const start = Math.round(data.length * (matStart / duration)); // sample start index
    const end = Math.round(data.length * ((matStart + matDur) / duration)); // sample end index
    const len = end - start;
    const matWidth = (matDur / speed) * this.scale; // 素材片段单次播放的时长(对应长度px)
    const barWidth = Math.max(Math.round(matWidth / len), 3);
    const bars = Math.ceil(matWidth / barWidth);
    const step = round(len / bars, 1); // 每个bar包含采样点的数量
    const applyFade = (x, vol) => {
      if (x < this.node.fadeIn * this.scale) {
        return vol * (x / (this.node.fadeIn * this.scale));
      } else if (clipWidth - x < this.node.fadeOut * this.scale) {
        return vol * ((clipWidth - x) / (this.node.fadeOut * this.scale));
      }
      return vol;
    }

    // 计算ss部分的宽度
    const ssWidth = round((matStart / speed) * this.scale, 3);
    const offset = ssWidth % barWidth; // 矫正bar绘制的x偏移
    const ctx = this.preview.getContext('2d');
    // x是相对clip的, 开始需要对barWidth取整，避免抖动
    const x0 = Math.round(left / barWidth) * barWidth;
    let loops = 0;
    for (let x = x0; x < left + width; x += barWidth) {
      if (x > matWidth && !this.node.loop) break;
      const loopX = x % matWidth; // 去掉循环之后的 x
      const n = Math.floor((loopX + ssWidth) / barWidth); // 从素材开始的第N个bar，保持一致性
      const arr = data.slice(Math.round(n * step), Math.round((n + 1) * step));
      const matVol = Math.max.apply(null, arr);
      const vol = applyFade(x, matVol * volume);
      const h = Math.min(vol, 0.98) * height;
      for (const style of styles) {
        if (h < style.h) continue;
        ctx.fillStyle = style.color;
        // x是相对于clip-view的，需要减left才是相对于canvas的
        ctx.fillRect(x - left - offset, height - h, barWidth - 1, h - style.h);
      }

      const _loops = Math.floor(x / matWidth);
      if (_loops !== loops) {
        ctx.fillStyle = '#FFF';
        ctx.fillRect(x - left - offset - 1, 0, 1, height);
        loops = _loops;
      }
    }
  }

  updatePreview() {
    if (!this.visible) return;
    const renderId = this.renderId = uuid();
    const { left, width } = this.renderPreviewCanvas(FRAME_HEIGHT / 2, 2);
    if (!left && !width) return;

    // 计算可视区域内的start/n
    let start = Math.max(0, Math.floor(( 2 * left / FRAME_HEIGHT) - 1));
    let end = start + Math.ceil(2 * width / FRAME_HEIGHT) + 1;

    const ctx = this.preview.getContext('2d');
    const mat = this.node.material;
    let speed = 1;
    let dx = 0;
    if (mat) {
      // 按原始素材来计算每帧应该放的位置，这样对裁剪是稳定的
      speed = mat.speed || 1;
      const ssLeft = (mat.getStartOffset() / speed) * this.scale * 2; // 左边隐藏ss长度(2x长度)
      dx = Math.floor(ssLeft / FRAME_HEIGHT) * FRAME_HEIGHT - ssLeft; // 需要offset的x长度(2x长度)
    }
    const tick = (speed * FRAME_HEIGHT) / (2 * this.scale); // 1帧宽度对应的mat时长
    // 只有在scale足够大（1秒=500px）才精确到0.01
    // const decimal = 1; //this.scale > 500 ? 2 : 1;
    for (let i = start; i < end; i++) {
      let x = dx + (i * FRAME_HEIGHT);
      let time = this.node.absStartTime + ((x + FRAME_HEIGHT / 2) / (2 * this.scale));
      const mt = mat ? this.node.materialTime(time, true).time : Math.min(time, this.node.absEndTime - 0.1);
      // 四舍五入到0.1秒，尽量能命中cache
      this.renderFrame(round(mt, 1), tick, (img) => {
        if (renderId != this.renderId) return;
        imgReady(img, () => {
          // todo: apply with node.getFrame() ??
          ctx.drawImage(img, x - (left * 2), 0, FRAME_HEIGHT, FRAME_HEIGHT);
        });
      });
    }
  }

  renderPreviewCanvas(height, r=1) {
    if (!this.preview) {
      this.preview = document.createElement('canvas');
      this.preview.classList.add('preview-canvas');
      this.canvasCtr = document.createElement('div');
      this.canvasCtr.classList.add('canvas-ctr');
      this.canvasCtr.append(this.preview);
      this.append(this.canvasCtr);
      this.addAudioBtn();
    }

    if (!this.preview.parentNode) this.canvasCtr.append(this.preview);

    // this.preview.style.height = `${height}px`;
    this.preview.setAttribute('height', height * r);

    let [ maxWidth, _, scrollX ] = this.boardSize;
    if (maxWidth < 0) return {}; // 如果没有parent就不要往下了，不然可能会全量宽度渲染。。。
    const clipWidth = this.styleNumber('width');

    const mw = 100; // canvas左右各保留100px的余量
    const width = Math.round(Math.min(clipWidth, maxWidth + mw * 2));

    this.preview.style.width = `${width}px`;
    this.preview.setAttribute('width', width * r);

    const absLeft = this.styleNumber('left') - scrollX;
    const absRight = absLeft + width;
    const left = Math.max(0, - absLeft - mw); // yw余量
    this.preview.style.left = `${left}px`;

    const ctx = this.preview.getContext('2d');
    ctx.clearRect(0, 0, this.preview.width, this.preview.height);
    return { left, width, clipWidth };
  }

  async audioData(src) {
    if (FRAME_CACHE[src]) return FRAME_CACHE[src];
    return new Promise(resolve => {
      this.audioQueue.enqueue(async () => { // 用Queue避免并发导致重复
        if (!FRAME_CACHE[src]) {
          const ctx = new AudioContext({sampleRate:3000});
          const arrayBuffer = await fetch(src).then(r => r.arrayBuffer());
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
          FRAME_CACHE[src] = await AudioUtil.data(audioBuffer);
        }
        resolve(FRAME_CACHE[src] || {});
      });
    });
  }

  renderFrame(time, tick, callback) {
    if (!this.node) return;
    const renderId = this.renderId;
    const src = this.node.material ? this.node.material.path : this.node.id;
    if (!FRAME_CACHE[src]) FRAME_CACHE[src] = {};
    if (FRAME_CACHE[src][time]) return callback(FRAME_CACHE[src][time], time);

    // 单块frame所代表的时长，应该是在此范围内找cache
    hitCache:
    for (let i = 0; i < tick * 5; i += 0.1) {
      for (let p of [-1, 1]) {
        const k = i * p + time;
        if (FRAME_CACHE[src][k]) {
          callback(FRAME_CACHE[src][k], k);
          if (i < tick) return; // 如果足够精确了，就先不要更准的了
          else break hitCache;
        }
      }
    }

    this.videoQueue.enqueue(async () => { // 用Queue避免并发导致重复
      // render已经变更了，跳过
      if (renderId !== this.renderId) return;
      // todo: 如果当前的帧是invisible的，应该pass并扔到队位
      // 可能已经有cache了
      if (!FRAME_CACHE[src][time]) {
        const opt = { width: FRAME_HEIGHT, height: FRAME_HEIGHT, rawFrame: true }; // 高清x2
        let data;
        try {
          data = await this.node.getPreview(time || 0.01, opt); // 0可能不会seek导致黑屏
        } catch (e) { return; }
        if (!data) {
          setTimeout(() => {
            // 如果renderId还没变，那就再重试一下
            if (renderId === this.renderId) this.renderFrame(time, tick, callback)
          }, 300);
          return;
        }
        const img = document.createElement('img');
        img.src = data;
        if (!FRAME_CACHE[src]) FRAME_CACHE[src] = {};
        FRAME_CACHE[src][time] = img;
        // if (this.node.type === 'scene') {
        //   document.getElementById('ttt1').append(`${time}`);
        //   document.getElementById('ttt1').append(img);
        // }
      }
      callback(FRAME_CACHE[src][time], time);
    });
  }

  get boardSize() {
    const board = this.board;
    if (!board) return [ -1, -1 ];
    return [ 
      board.parentNode.offsetWidth, board.parentNode.offsetHeight,
      board.scrollLeft - board.trackHeadWidth, board.scrollTop,
    ];
  }

  get board() {
    let parent = this.parentNode;
    if (!parent) return null;
    while (parent) {
      if (parent.classList?.contains('mirae-board')) return parent;
      parent = parent.parentNode;
    }
  }

  scrollToVisible(opts) {
    if (this.cropMode && this.cropView) return this.cropView.scrollToVisible(opts);
    return super.scrollToVisible(opts);
  }

  get cropMode() {
    return this.node?.cropMode === 'time';
  }

  clearCache(key) {
    if (FRAME_CACHE[key]) delete FRAME_CACHE[key];
  }

  static create(opts) {
    const { moveListener } = opts;
    return super.create().setOpts(opts).addMoveListener(moveListener);
  }
}

MiraClipView.register();
module.exports = MiraClipView;