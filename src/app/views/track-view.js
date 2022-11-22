'use strict';

require('../styles/track.less');
const { SELECT, TYPE_SPINE, TYPE_VIDEO, TYPE_AUDIO, TYPE_TEXT, TYPE_STICKER, TYPE_PLACEHOLDER } = require('../utils/static');
const MiraEditorBase = require('./base-view');
const MiraButton = require('./button-view');

class MiraTrackView extends MiraEditorBase {
  static TAG = 'mira-editor-track';

  init() {
    this.addClass('mirae-track');
    this.head = document.createElement('div');
    this.head.classList.add('head');
    this.append(this.head);
    return super.init();
  }

  clear() {
    this.innerHTML = '';
  }

  get canSetAudio() {
    return this.type !== TYPE_PLACEHOLDER;
    // return [TYPE_SPINE, TYPE_VIDEO, TYPE_AUDIO, TYPE_TEXT].includes(this.type);
  }

  get canSetVisible() {
    return [TYPE_SPINE, TYPE_VIDEO, TYPE_TEXT, TYPE_STICKER].includes(this.type);
  }

  get canArrange() {
    return [TYPE_TEXT, TYPE_VIDEO].includes(this.type);
  }

  refresh() {
    if (this.canSetAudio) {
      let hasOn = false;
      this.childNodes.forEach(x => {
        if (!x.node) return;
        if (x.node.audio) hasOn = true;
      });
      this.audioBtn.toggleClass('track-audio-off', !hasOn);
    }

    if (this.canSetVisible) {
      let hasOn = false;
      this.childNodes.forEach(x => {
        if (!x.node) return;
        if (x.node.active) hasOn = true;
      });
      this.visibleBtn.toggleClass('track-visible-off', !hasOn);
    }
  }

  addBackBtn(onclick) {
    const backBtn = MiraButton.create(this).addClass('go-back-btn');
    if (onclick) backBtn.onClick = onclick;
  }

  setType(type) {
    this.type = type;
    if (!this.iconBtn) {
      this.iconBtn = MiraButton.create(this)
        .addClass(['track-icon-btn', 'track-btn'])
        .set('data-tint', '轨道全选 ⌘+A');
      this.iconBtn.onClick = (e) => { // 全选
        let nodes = [], unselected = [];
        this.childNodes.forEach(x => {
          if (!x.node || !x.node.type || x.node.type === 'placeholder') return;
          if (!x.hasClass('selected')) unselected.push(x.node);
          nodes.push(x.node);
        });
        // 如果有未选择的就选上，否则就全部取消选择
        if (unselected.length > 0) nodes = unselected;
        if (nodes[0]) nodes[0].emit(SELECT, { action: 'multi', nodes });
      }
    }

    if (this.canSetAudio) {
      this.audioBtn = MiraButton.create(this).addClass(['track-audio-btn', 'track-btn']);
      this.audioBtn.onClick = (e) => {
        const on = !!this.audioBtn.classList.contains('track-audio-off');
        // const on = !this.audioBtn.toggleClass('track-audio-off');
        const nodes = [];
        const delta = {};
        this.childNodes.forEach(x => {
          if (!x.node || !x.apply || x.node.audio === on) return;
          nodes.push(x.node);
          delta[x.node.id] = { to: { audio: on } };
        });
        if (nodes.length > 0) this.applyChange(nodes, delta);
        this.refresh();
      }
    }

    if (this.canSetVisible) {
      this.visibleBtn = MiraButton.create(this).addClass(['track-visible-btn', 'track-btn']);
      this.visibleBtn.onClick = (e) => {
        const on = !!this.visibleBtn.classList.contains('track-visible-off');
        const nodes = [];
        const delta = {};
        this.childNodes.forEach(x => {
          if (!x.node || !x.apply || x.node.active === on) return;
          nodes.push(x.node);
          delta[x.node.id] = { to: { active: on } };
        });
        if (nodes.length > 0) this.applyChange(nodes, delta);
        this.refresh();
      }
    }

    if (this.canArrange) {
      this.arrangeBtn = MiraButton.create(this)
        .addClass(['track-arrange-btn', 'track-btn'])
        .set('data-tint', '对齐片段');
      this.arrangeBtn.onClick = (e) => {
        const _nodes = [];
        this.childNodes.forEach(x => {
          if (!x.node || !x.apply) return;
          _nodes.push(x.node);
        });

        if (_nodes.length <= 0) return;
        const nodes = [];
        const delta = {};
        _nodes.sort((a, b) => a.absStartTime - b.absStartTime);
        let start = 0;
        for (const node of _nodes) {
          const root = node.parents.reverse().find(x => ['creator', 'scene'].includes(x.type));
          if (node.absStartTime - root.absStartTime === start && root === node.parent) {
            start += node.duration;
            continue; // 不用改
          }
          const to = { start }; // 相对于root, 都是0开始
          if (!node.conf.duration && !node.conf.end) { // 设置时长
            to.duration = node.duration;
          }
          if (root !== node.parent) to.parent = root;
          delta[node.id] = { to };
          nodes.push(node);
          start += node.duration;
        }
        console.log('rrrr', delta);
        if (nodes.length > 0) this.applyChange(nodes, delta);
        // this.refresh(); // 吸附不是开关，没有状态，无需刷新
      }
    }
    return this.setName(type).addClass(`mirae-track-${type}`);
  }

  setName(name) {
    return 0 ? this.set('data-name', name) : this;
  }

  remove() {
    this.applyChange = null;
    super.remove();
  }
}

MiraTrackView.register();
module.exports = MiraTrackView;