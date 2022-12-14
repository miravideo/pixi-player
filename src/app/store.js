import md5 from 'md5';
import { makeObservable, runInAction, observable } from 'mobx';
import React from "react";
import EventEmitter from "eventemitter3";
const { Player, Burner } = global['pixi-player'] || {};
import pkg from '../../package.json';
import { color } from './utils/color';
import PluginUtil from './utils/plugin';

const PRELOAD_RATIO = 0.1;
const KEYS = { space:' ', left:'ArrowLeft', right:'ArrowRight' };

const ExtendsEvent = {
  get mctrlKey() {
    return this.ctrlKey || this.metaKey;
  },
}
PluginUtil.mixin({src: ExtendsEvent, dst: KeyboardEvent});
PluginUtil.mixin({src: ExtendsEvent, dst: MouseEvent});

class Store extends EventEmitter {
  constructor(opt) {
    super();
    this._id = 0;
    this.opt = opt;
    this.containerRef = React.createRef();
    this.canvasRef = React.createRef();
    this.editorRef = React.createRef();

    // state
    this.enabled = true;
    this.muted = false;
    this.loading = false;
    this.loaded = false;
    this.playing = false;
    this.loadingProgress = 0;
    this.canvasStyle = {};
    this.currentTime = 0;
    this.duration = 0;
    this.timePercent = 0;

    this.timeHandlerShow = false;
    this.controlShow = true;

    this.hideMenuButton = !!opt.hideMenuButton;
    this.showMenu = undefined;
    this.toastMsg = undefined;
    this.toastHide = true;

    // player
    this.player = new Player(opt);
    this.burner = new Burner(opt);
    makeObservable(this, {
      loading: observable,
      loaded: observable,
      playing: observable,
      loadingProgress: observable,
      canvasStyle: observable,
      muted: observable,
      duration: observable,
      currentTime: observable,

      timePercent: observable,
      timeHandlerShow: observable,
      controlShow: observable,

      hideMenuButton: observable,
      showMenu: observable,
      toastMsg: observable,
      toastHide: observable,
    });
  }

  async load() {
    if (this.loading) return;
    this.cancelFunc = () => {
      this.player.destroy();
    }

    this.showLoading();
    const onprogress = (progress) => {
      runInAction(() => {
        this.loadingProgress = progress;
      });
      this.player.log('preloading', progress);
    }

    this.player.on('playing', () => {
      this.focus();
      runInAction(() => { this.playing = true });
    }).on('pause', () => {
      this.focus();
      runInAction(() => { this.playing = false });
    }).on('play', () => {
      this.focus();
      runInAction(() => { this.play = true });
    }).on('preloading', (evt) => {
      this.showLoading(PRELOAD_RATIO + (1-PRELOAD_RATIO) * (evt.loaded / evt.total));
    }).on('error', (e) => {
      if (e.error) {
        runInAction(() => {
          this.error = e.error
          this.toast(e.error);
        });
      }
    }).on('loadedmetadata', meta => {
      this.focus();
      this.hideToast();
      runInAction(() => {
        this.loaded = true;
        this.duration = this.player.duration;
        this.timePercent = this.currentTime / this.duration;
      });
    }).on('timeupdate', (e) => {
      runInAction(() => {
        this.currentTime = e.currentTime;
        this.timePercent = this.currentTime / this.duration;
      });
    }).on('ended', () => {
      runInAction(() => {
        this.playing = false;
      });
    }).on('resize', () => {
      this.fit();
    });

    await this.player.init({...this.opt, onprogress, view: this.canvasRef.current });
    if (!this.player) return;
    this.hideLoading();
    runInAction(() => {
      this.loaded = true;
      this.duration = this.player.duration;
      this.fit();
    });

    // debug loading progress
    // this.loading = true;
    // this.loadingProgress = 0.3;
  }

  async export(filename, save=true) {
    if (this.loading) return;
    this.player.emit('burning', true);
    this.cancelFunc = () => {
      this.burner.cancel();
    }
    this.showLoading(0.001);

    const res = await this.burner.export(this.player, (p) => {
      runInAction(() => {
        this.loadingProgress = Math.max(p, 0.001);
      });
    });

    this.player.emit('burning', false);
    if (!save) return res;

    const { url, speed } = res || {};
    if (!url) {
      // fail or cancel
      this.toast('Fail!');
      this.hideLoading();
      return;
    }
    this.player.emit('burned');

    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = typeof(filename) === 'string' ?
        (filename.endsWith('.mp4') ? filename : `${filename}.mp4`) :
        `video_export_${speed.toFixed(2)}x.mp4`;
    this.containerRef.current.appendChild(a);
    a.click();
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
      a.remove();
    }, 1000);

    this.hideLoading();
    // delete res.url;
    return res;
  }

  fit() {
    if (!this.loaded) return {};
    let width = this.player.width;
    let height = this.player.height;
    let [ctrWidth, ctrHeight] = [this.opt.width, this.opt.height];
    if (this.opt.outsideControls) ctrHeight -= 70; // todo: hardcode
    let top = 0, left = 0;
    if (this.opt.padding || this.opt.paddingX || this.opt.paddingY) {
      let [paddingX, paddingY] = [
        `${this.opt.paddingX !== undefined ? this.opt.paddingX : (this.opt.padding || 0)}`,
        `${this.opt.paddingY !== undefined ? this.opt.paddingY : (this.opt.padding || 0)}`
      ];
      if (paddingX.endsWith('%')) paddingX = paddingX.replace('%', '') * 0.01 * ctrWidth;
      if (paddingY.endsWith('%')) paddingY = paddingY.replace('%', '') * 0.01 * ctrHeight;
      if (!isNaN(paddingX)) {
        left = Number(paddingX);
        ctrWidth = Math.round(ctrWidth - (left * 2));
      }
      if (!isNaN(paddingY)) {
        top = Number(paddingY);
        ctrHeight = Math.round(ctrHeight - (top * 2));
      }
    }
    this.scale = Math.min(ctrWidth / width, ctrHeight / height);
    width = (this.scale * width) >> 0;
    height = (this.scale * height) >> 0;
    const marginLeft = left + (ctrWidth - width) / 2;
    const marginTop = top + ((ctrHeight - height) / 2);
    const style = {
      ctrWidth: this.opt.width, ctrHeight: this.opt.height,
      width, height, marginLeft, marginTop
    };
    runInAction(() => {
      this.canvasStyle = style;
    });
    return style;
  }

  get containerStyle() {
    const style = {};
    if (this.opt.background) {
      style.background = this.opt.background;
    }
    return style;
  }

  clickCanvas(e) {
    this.player.emit('click', e.nativeEvent);
    if (this.opt.disableClickPlay) return;
    this.togglePlay();
  }

  showLoading(progress) {
    runInAction(() => {
      this.loading = true;
      if (progress > 0 && progress <= 1) this.loadingProgress = Number(progress);
    });
  }

  hideLoading() {
    runInAction(() => {
      this.loading = false;
      this.loadingProgress = 0;
      this.cancelFunc = null;
    });
  }

  cancelLoading() {
    if (!this.loading) return;
    if (this.cancelFunc) this.cancelFunc();
    this.hideLoading();
  }

  togglePlay() {
    if (!this.loaded || !this.enabled) return;
    if (this.playing) {
      this.player.pause();
    } else {
      this.player.play();
    }
  }

  toggleMute() {
    runInAction(() => {
      this.muted = !this.muted;
      this.player.volume = this.muted ? 0 : 1;
    });
  }

  onSeeking(seeking) {
    this._seek = seeking;
    if (seeking) {
      this.playingOnSeek = this.playing;
      if (this.playingOnSeek) this.player.pause();
    } else {
      if (this.playingOnSeek) this.player.play();
      this.playingOnSeek = null;
    }
  }

  focus() {
    if (this.containerRef.current) {
      this.containerRef.current.focus();
    }
  }

  keyDown(e) {
    this.player.emit('keydown', e.nativeEvent);
    if (Object.values(KEYS).includes(e.key)) {
      e.preventDefault();  // 防止滚动页面
    }
  }

  keyUp(e) {
    this.player.emit('keyup', e.nativeEvent);
    if (!this.enabled || !this.opt.enableKeyboard) return;
    if (e.key === KEYS.space) {
      this.togglePlay();
    } else if ([KEYS.left, KEYS.right].includes(e.key)) {
      const i = KEYS.left === e.key ? -1 : 1;
      this.player.currentTime = Math.min(this.duration, Math.max(0, this.currentTime + i));
    }
  }

  setTimePercent(p) {
    runInAction(() => {
      this.timePercent = p;
      this.player.currentTime = p * this.duration;
    });
  }

  showHandler(show) {
    runInAction(() => {
      this.timeHandlerShow = show;
    });
  }

  showControls(show) {
    if (!this.enabled) return;
    show = this.playing ? show : true;
    if (this.showCtrlTimer) clearTimeout(this.showCtrlTimer);
    this.showCtrlTimer = setTimeout(() => {
      this.showCtrlTimer = null;
      runInAction(() => {
        if (this.controlShow === show) return;
        this.controlShow = show;
      });
    }, 100);
  }

  enableControls(enable) {
    runInAction(() => {
      this.controlShow = enable;
      this.enabled = enable;
    });
  }

  editable(enable) {
    this.opt.disableClickPlay = enable;
    this.opt.outsideControls = enable;
    this.fit();
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.player.emit('resize', this.fit());
  }

  get width() {
    return this.opt.width;
  }

  get height() {
    return this.opt.height;
  }

  set width(w) {
    this.opt.width = w;
  }

  set height(h) {
    this.opt.height = h;
  }

  hideToast() {
    runInAction(() => {
      this.toastHide = true;
    });
  }

  toast(msg, durationInMs=3000) {
    runInAction(() => {
      if (this.toastTimer) {
        clearTimeout(this.toastTimer);
        this.toastTimer = null;
      }
      if (!msg) return this.toastHide = true;
      this.toastMsg = msg;
      this.toastHide = false;
      durationInMs = parseInt(durationInMs);
      if (durationInMs >= 0) {
        this.toastTimer = setTimeout(() => {
          this.hideToast();
        }, durationInMs);
      }
    });
  }

  copyToPB(value) {
    try {
      navigator.clipboard.writeText(value);
      this.toast('Source copied!');
    } catch (err) {
      this.toast('Failed to copy source! See console log');
      console.log(value);
    }
  }

  menuHide() {
    runInAction(() => {
      this.showMenu = undefined;
    });
  }

  menuShow() {
    const items = [];

    if (Array.isArray(this.opt.menuItems)) {
      this.opt.menuItems.map(item => {
        if (typeof item !== 'object') items.push('-');
        else if (item.title || item.desc) items.push(item);
      });
    } else {
      items.push({ title: 'Source in JSON', action: () => {
        const res = this.player.toJson();
        this.copyToPB(JSON.stringify(res, null, 2));
      }});

      items.push({ title: 'Source in MiraML', action: () => {
        const res = this.player.toMiraML();
        this.copyToPB(res);
      }});
    }

    if (this.canvasStyle.ctrWidth) {
      if (this.canvasStyle.ctrWidth < 250) {
        items.push({ title: 'Sound', desc: this.muted ? 'Off' : 'On', action: () => {
          this.toggleMute();
        }});
      }
      if (this.canvasStyle.ctrWidth < 300) {
        items.push({ title: 'Export Video', action: () => {
          this.export();
        }});
      }
    }

    if (items.length > 0) {
      items.push('-');
      items.push({ title: 'PIXI Player', desc: `v${pkg.version}`});
      runInAction(() => {
        this.showMenu = { items };
      });
    }
  }

  get version() {
    return pkg.version;
  }

  destroy() {
    this.removeAllListeners();
    this.containerRef = null;
    this.canvasRef = null;
    this.editorRef = null;
    if (this.player) this.player.destroy();
    this.player = null;
    if (this.burner) this.burner.destroy();
    this.burner = null;
  }
}

export default Store;
