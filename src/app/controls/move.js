'use strict';

const { SELECT, RESIZE, KEYDOWN, KEYUP, HISTORY } = require('../utils/static');
const MiraEditorMove = require('../views/move-view');
const BaseControl = require('./base');
const { arrMulti, round } = require('../utils/math');
const { dmap, uuid } = require('../utils/data');
const Point = require('../utils/point');

const MIN_MOVE_SIZE = 50;

class Move extends BaseControl {
  static type = "move";
  static TAG = MiraEditorMove;
  static CHG_HOOK = 'setWH';
  static KEY_MAP = {
    ArrowUp:    [ 0, -1], ArrowDown:  [ 0,  1],
    ArrowLeft:  [-1,  0], ArrowRight: [ 1,  0],
  }

  constructor(editor) {
    super(editor);
    this.selector = editor.controls.select;
    this._controls = {};

    // add hook
    this.wrap(this.selector, 'createBox').after((args, box) => {
      const [ _, selected ] = args;
      if (selected && box) this.setNode().appendControl(box).show();
    });
    this.wrap(this.selector, 'enableMulti').after(() => {
      this.show(!this.selector.withMulti); // 多选状态下，隐藏控件，可以再多选到背景挡住的元素
    });
    this.wrap(this.selector, 'hideSelect').after(() => {
      this.remove();
    });
    if (this.constructor.type === 'move') {
      this.wrap(this.selector, 'fit').after(() => {
        this.updateCursor(false);
      });
    }
  }

  show(show) {
    if (show === undefined) show = !this.selector.withMulti;
    if (this.view) this.view.show(show);
    return this;
  }

  events() {
    const evts = { [KEYDOWN]: this.onKeyDown(), [KEYUP]: this.onKeyUp() };
    if (this.constructor.type === 'move') {
      evts[SELECT] = this.onSelect();
      evts[HISTORY] = () => this.editMode && this.onTextChange();
    }
    return evts;
  }

  onKeyDown() {
    return (evt) => {
      if (this.constructor.type !== 'move' || !this.box) return;
      if (this.editMode) {
        if (evt.key === 'Backspace') {
          return this.updateText(this.node.delete());
        } else if (evt.key === 'Escape') {
          return this.remove();
        } else if (['z', 'y'].includes(evt.key.toLowerCase()) && evt.mctrlKey) {
          // undo/redo，避免应用到textarea里影响text
          evt.preventDefault();
        } else if (evt.key.toLowerCase() === 'c' && evt.mctrlKey) {
          return this.copyText();
        } else if (evt.key.toLowerCase() === 'x' && evt.mctrlKey) {
          // cut = copy + delete
          this.copyText();
          return this.updateText(this.node.delete());
        } else if (this.constructor.KEY_MAP[evt.key]) {
          evt.preventDefault();
          const [x, y] = this.constructor.KEY_MAP[evt.key];
          this.node.selectMove({x, y}, evt.shiftKey, evt.mctrlKey);
          this.updateCursor();
        } else if (evt.code === 'Space') {
          // todo: 空格打不出来，很奇怪
          this.textView.value = ' ';
          this.input();
          evt.preventDefault();
        }

      } else if (this.node.type === 'text' && evt.key === 'Enter') {
        evt.preventDefault();
        this.textEditStart({x: 0, y: 0});

      } else if (this.constructor.KEY_MAP[evt.key]) {
        // this.view?.hasClass('hover') && 
        // 只在鼠标hover在上面的时候才能键盘移动
        evt.preventDefault();
        const move = this.constructor.KEY_MAP[evt.key];
        const [ x, y ] = arrMulti(move, evt.shiftKey ? 10 : 1);
        this.moveDelta({ x, y });
      }
    }
  }

  onKeyUp() {
    return (evt) => {
      // if (this.constructor.type !== 'move') return;
    }
  }

  setNode(node) {
    this.node = node || this.selector.selected;
    return this;
  }

  controls(box) {
    if (this.node.cropMode) return {};
    return {
      move: { box, styleClass: 'box' },
      moveHandle: { box: box.handleBox, styleClass: 'handle' },
    };
  }

  appendControl(box) {
    if (!this.node) return this;
    this.box = box;

    // clean up: destroy prev dots and events
    if (this._controls) {
      Object.values(this._controls).map(x => x.remove());
    }
    this._controls = {};

    for (const [key, opts] of Object.entries(this.controls(box))) {
      if (!opts.box) opts.box = box;
      if (typeof(opts.box) === 'string' && this._controls[opts.box]) {
        opts.box = this._controls[opts.box];
      }
      opts.moveListener = this;
      const tag = opts.tag || this.constructor.TAG;
      this._controls[key] = tag.create(opts);
    }

    // 在box改变时，动态隐藏控制点
    if (this.boxWrapper) this.boxWrapper.revoke();
    this.boxWrapper = this.wrap(box, this.constructor.CHG_HOOK).after(() => {
      this.updateShow(box);
    });
    // 初始化也执行一次，不然就不统一了
    if (this.node.cropMode !== 'time') this.updateShow(box); // 时间crop就不做这个了
    return this;
  }

  updateShow(box) {
    const show = !this.editMode && Math.min(box.size.width, box.size.height) * box.scale < MIN_MOVE_SIZE;
    if (this._controls.moveHandle) this._controls.moveHandle.show(show);
  }

  onSelect() {
    return (event) => {
      if (!this.view || !event || !event.data) return;
      // 选择之后，触发move开始，就可以直接拖动了
      this.view.start(event.data.originalEvent);
    }
  }

  get canMove() {
    return (this.node && this.box && !this.node.cropMode);
  }

  getDelta(event) {
    return dmap(event.delta, n => n / this.box.scale);
  }

  point(event) {
    const boxLeftTop = this.box.points()[0];
    return this.canvasCoord(event, 1 / this.box.scale)
               .rebase(boxLeftTop).rotate(-this.box.rotation);
  }

  async onMove(event) {
    if (!this.canMove) return;
    if (this.editMode) return this.textSelect(event);
    await this.moveDelta(this.getDelta(event));
  }

  async moveDelta(delta) {
    if (!this.canMove) return;
    // 只要开始移动了，就退出multi模式，不然可能会hover自己
    if (event.moved) this.selector.enableMulti(false);
    await this.update(delta);
    this.box.move();
    const { x: pX, y: pY } = round(this.box.position, 0);
    this.toast(`X:${pX} Y:${pY}`, 1000);
  }

  onMoveStart(event) {
    if (!this.canMove) return;
    if (this.editMode) return this.node.selectStart(this.point(event));
    return this;
  }

  onMoveEnd(event) {
    if (!this.canMove) return;
    if (this.editMode) return this.textSelect(event);
    if (!event.moved) this.selector.toggleSelect();
    // trigger DblClick
    const now = Date.now();
    if (now - this.lastClickTime < 600 && this.node.id === this.lastClickNodeId) {
      this.onDblClick(event);
    }
    this.lastClickTime = now;
    this.lastClickNodeId = this.node.id;
    return this;
  }

  onDblClick(event) {
    // 双击进入文本编辑状态
    if (this.node?.type === 'text') this.textEditStart(event);
    else if (this.node?.type === 'group') { // group之后，进入文字编辑
      const { left, top } = this.editor.container.getBoundingClientRect();
      const ep = (new Point(event.position)).rebase([left, top]).scale(1/this.box.scale);
      for (const [nodeId, box] of Object.entries(this.node.boxes)) {
        // todo: 暂时只支持双击编辑文字, 以后可能会更换素材之类的
        if (this.node.nodes[nodeId]?.type !== 'text') continue;
        const { x, y } = ep.rebase(box.points()[0]).rotate(-box.rotation);
        if (0 < x && x < box.size.width && 0 < y && y < box.size.height) {
          // console.log('in box!', nodeId, {x, y}, box.size);
          // todo: 如果有多个，暂时也只支持选第一个编辑
          this.setNode(this.node.nodes[nodeId]).appendControl(box).show();
          this.textEditStart(event);
          break;
        }
      }
    }
  }

  textEditStart(event) {
    if (!this.view) return;
    this.view.addClass('editMode');
    this.box.addClass('editMode');
    this.node.editMode = true;
    this.node.selectionBgColor = this.editor.opts.textSelectionColor;
    this.node.selectStart(this.point(event));
    this.selector.hideHover();
    this.selector.enableMulti(false); // 为了触发其他控件的show
    this.textSelect(event); // init cursor
    this._textSenderId = uuid(); // 每次新起一个senderId
    this.updateShow(this.box);
  }

  textSelect(event) {
    // lock判断，避免刚刚updateText完，又触发了select
    if (!this.locked('updateText')) this.node.selectEnd(this.point(event));
    // else console.log('locked');
    this.updateCursor();
  }

  updateCursor(show=true) {
    if (!this.view) return;
    if (!this.cursorView) {
      if (!show) return;
      this.cursorView = document.createElement('div');
      this.cursorView.setAttribute('mira-editor-el', '');
      this.cursorView.classList.add('mirae-text-cursor');
      this.cursorView.style.backgroundColor = this.editor.opts.textCursorColor;

      this.textView = document.createElement('textarea');
      this.textView.setAttribute('mira-editor-el', '');
      this.textView.addEventListener('compositionstart', this.onCompStart.bind(this));
      this.textView.addEventListener('compositionend', this.onCompEnd.bind(this));
      this.textView.addEventListener('input', this.onInputChar.bind(this));
      this.cursorView.append(this.textView);

      // 已经从player.editor监听了，重复
      // const evts = this.cachedEvents();
      // this.textView.addEventListener('keyup', evts.keyup);
      // this.textView.addEventListener('keydown', evts.keydown);
    }

    const cursor = this.node.cursor();
    const scale = this.box.scale;
    const p = new Point(cursor).scale(scale);
    const h = cursor.height * scale;
    this.cursorView.style.transform = `translate(${p.x}px, ${p.y+(h*0.5)-1}px) scaleY(${h + 2})`;
    if (!show) return;

    if (this.cursorView.parentNode !== this.view) this.view.append(this.cursorView);
    this.textView.focus();
    this.cursorView.classList.remove('mirae-text-cursor-flash');
    this.lock(500, () => {
      // 0.5秒之后再开始闪
      this.cursorView && this.cursorView.classList.add('mirae-text-cursor-flash');
    }, 'cursor');

    // this.editor.enableKeyboard(false);
  }

  onCompStart(e) {
    this.inputStatus = 'COMP_START';
  }

  onCompEnd(e) {
    setTimeout(() => {
      this.input();
      this.inputStatus = 'COMP_END';
    }, 100);
  }

  onInputChar(e) {
    if (this.inputStatus === 'COMP_START') return;
    this.inputStatus = 'INPUT';
    this.input();
  }

  clearTextValue() {
    this.textView.value = '';
  }

  input() {
    const val = this.textView.value;
    this.updateText(this.node.input(val), val);
    this.clearTextValue();
  }

  async updateText(to, inputString) {
    if (to.text === this.node.text) return; // not change
    const isDel = !inputString;
    if (this._lastTextOp !== isDel || inputString?.includes('\n')) {
      this._lastTextOp = isDel;
      this._textSenderId = uuid(); // 新起一条历史
    }
    await this.editor.update([this.node], to, this._textSenderId);
    this.onTextChange(to.cursorIndex);
    this.lock(500, null, 'updateText'); // 避免刚刚updateText完，cursor未更新又触发了select
  }

  onTextChange(cursorIndex) {
    if (cursorIndex === undefined) cursorIndex = this.node.getConf('cursorIndex');
    // 要等text更新好之后再更新一遍cursorIndex，才能设置成正确的坐标位置
    this.node.setConf('cursorIndex', cursorIndex);
    this.box.resize(); // 文字变动之后应该框的大小也会变
    this.updateCursor();
    this.editor.emit(RESIZE, {}); // 框大小改变之后，可能也涉及到group选择的框大小改变
  }

  copyText() {
    const text = this.node.selection();
    navigator.clipboard.writeText(text);
  }

  get editMode() {
    return !!this.node?.editMode;
  }

  get view() {
    return this._controls?.move;
  }

  remove() {
    if (this.constructor.type !== 'move') return;
    if (this.view) this.view.remove();
    if (this.cursorView) this.cursorView.remove();
    if (this.textView) this.textView.remove();
    this.cursorView = null;
    if (this.editMode) {
      this.node.editMode = false;
      this.node.selectClean();
      // this.editor.enableKeyboard(true);
      this.selector.enableMulti(false); // 为了触发其他控件的show
    }
  }

  destroy() {
    this.selector = null;
    this.remove();
    return super.destroy();
  }
}

module.exports = Move;