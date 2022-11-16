import md5 from 'md5';
import { makeObservable, runInAction, observable } from 'mobx';
import React from "react";
import EventEmitter from "eventemitter3";
const { Player, Burner } = global['pixi-player'] || {};
import { version } from '../../package.json';

const PRELOAD_RATIO = 0.1;
const KEYS = { space:' ', left:'ArrowLeft', right:'ArrowRight' };

class Store extends EventEmitter {
  constructor(opt) {
    super();
    this._id = 0;
    this.opt = opt;
    this.containerRef = React.createRef();
    this.canvasRef = React.createRef();

    // state
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

  async export(filename) {
    if (this.loading) return;
    this.cancelFunc = () => {
      this.burner.cancel();
    }
    runInAction(() => {
      this.loading = true;
      this.loadingProgress = 0.01;
    });
    let burningR = 1;
    let initR = 0;
    if (!this.burner.ready) {
      initR = 0.05;
      await this.burner.init((p) => {
        runInAction(() => {
          this.loadingProgress = Math.max(p * initR, 0.01);
        });
      });
      burningR = 1 - initR;
    }

    const url = await this.burner.start(this.player, (p) => {
      runInAction(() => {
        this.loadingProgress = Math.max(initR + (p * burningR), 0.01);
      });
    });

    if (!url) {
      // fail or cancel
      runInAction(() => {
        this.loading = false;
        this.cancelFunc = null;
      });
      return;
    }

    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = typeof(filename) === 'string' ? (filename.endsWith('.mp4') ? filename : `${filename}.mp4`) : 'video_export.mp4';
    this.containerRef.current.appendChild(a);
    a.click();
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
      a.remove();
    }, 1000);

    runInAction(() => {
      this.loading = false;
      this.cancelFunc = null;
    });
  }

  async load() {
    if (this.loading) return;
    this.cancelFunc = () => {
      this.player.destroy();
    }
    runInAction(() => {
      this.loading = true;
    });
    const onprogress = (progress) => {
      runInAction(() => {
        this.loadingProgress = progress;
      });
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
      runInAction(() => {
        this.loading = true;
        this.loadingProgress = PRELOAD_RATIO + (1-PRELOAD_RATIO) * (evt.loaded / evt.total);
      });
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
    runInAction(() => {
      this.loaded = true;
      this.loading = false;
      this.duration = this.player.duration;
      this.cancelFunc = null;
    });
    this.fit();

    // debug loading progress
    // this.loading = true;
    // this.loadingProgress = 0.3;
  }

  fit() {
    if (!this.loaded) return {};
    let width = this.player.width;
    let height = this.player.height;
    this.scale = Math.min(this.opt.width / width, this.opt.height / height);
    width = (this.scale * width) >> 0;
    height = (this.scale * height) >> 0;
    const marginLeft = (this.opt.width - width) / 2;
    const marginTop = (this.opt.height - height) / 2;
    runInAction(() => {
      this.canvasStyle = {
        ctrWidth: this.opt.width, ctrHeight: this.opt.height,
        width, height, marginLeft, marginTop
      };
    });
  }

  togglePlay() {
    if (!this.loaded) return;
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
    if (this.opt.keyboardPlay && this.containerRef.current) {
      this.containerRef.current.focus();
    }
  }

  keyDown(e) {
    if (Object.values(KEYS).includes(e.key)) e.preventDefault();  // 防止滚动页面
  }

  keyUp(e) {
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
    show = this.playing ? show : true;
    if (this.showCtrlTimer) clearTimeout(this.showCtrlTimer);
    this.showCtrlTimer = setTimeout(() => {
      this.showCtrlTimer = null;
      runInAction(() => {
        if (this.controlShow == show) return;
        this.controlShow = show;
      });
    }, 100);
  }

  cancelLoading() {
    if (!this.loading) return;
    if (this.cancelFunc) this.cancelFunc();
    runInAction(() => {
      this.loading = false;
      this.cancelFunc = null;
    });
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.fit();
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
      items.push({ title: 'PIXI Player', desc: `v${version}`});
      runInAction(() => {
        this.showMenu = { items };
      });
    }
  }

  destroy() {
    this.containerRef = null;
    this.canvasRef = null;
    if (this.player) this.player.destroy();
    this.player = null;
    if (this.burner) this.burner.destroy();
    this.burner = null;
  }
}

export default Store;
