import Material from "./base";
import { settings } from "pixi.js";
import ImageUtils from "../util/image"

class ImageMaterial extends Material {

  async init(onprogress) {
    let res;
    try {
      res = await ImageUtils.getPixels(this.src, this.node.getConf('srcType') || '.GIF');
    } catch (e) {
      res = await ImageUtils.getPixels(this.src);
    }
    const { pixels, frameInfo } = res;

    let offset = 1;
    if (!frameInfo || !frameInfo.length) {
      if (pixels && pixels.shape.length === 3) { // single frame
        this.frameInfo = [{ delay: Math.pow(10, 9), disposal:1 }]; // mock frame info
        offset = 0;
      } else {
        throw new Error('Invalid gif frame info: ', frameInfo);
      }
    } else {
      this.frameInfo = frameInfo;
    }
    const imageData = [];
    const width = this.info.width = pixels.shape[offset + 0];
    const height = this.info.height = pixels.shape[offset + 1];
    const imgDataSize = width * height * pixels.shape[offset + 2];
    for (let i = 0; i < this.frameInfo.length; i++) {
      this.frameInfo[i].delay = this.frameInfo[i].delay / 100; // delay是0.01单位的int，这里统一转成秒
      const frame = pixels.data.slice(i*imgDataSize, (i+1)*imgDataSize);
      const imgData = new ImageData(new Uint8ClampedArray(frame.buffer), width, height);
      imageData.push(imgData);
    }
    this.info.duration = this.frameInfo.reduce((a,x) => a+x.delay, 0);
    this.frames = this.frameInfo.length;

    this.canvas = this.createCanvas();
    const tmpCanvas = this.createCanvas();
    this.imageData = [];
    for (let i = 0; i < this.frameInfo.length; i++) {
      let disposal = this.frameInfo[i].disposal > 2 ? 2 : this.frameInfo[i].disposal;
      // imageData存canvas，渲染效率更高，避免播放卡顿
      const canvas = this.createCanvas();
      const ctx = canvas.getContext('2d');
      if (disposal === 1) { // gif.disposal=1 不清空，覆盖
        this.drawCanvas(imageData[i], tmpCanvas, true);
        ctx.drawImage(tmpCanvas, 0, 0, width, height);
      } else {
        ctx.putImageData(imageData[i], 0, 0);
      }
      this.imageData.push(canvas);
    }
  }

  createCanvas() {
    return this.initCanvas(this.width, this.height);
  }

  getFrame(index) {
    const i = index < this.frames ? index : this.frames - 1; // 保持最后一帧
    return this.imageData[i];
  }

  getIndex(matTime) {
    let tt = 0, ii = 0;
    for (let i = 0; i < this.frameInfo.length; i++) {
      tt += this.frameInfo[i].delay;
      if (tt > matTime) break;
      ii = i;
    }
    return ii;
  }

  async render(nodeTime, type, view) {
    const { time } = this.matTime(nodeTime);
    const idx = this.getIndex(time);
    if (view.currentRenderIdx === idx) return; // 已经渲染过了
    view.currentRenderIdx = idx;

    const frame = this.getFrame(idx);
    // if (this.blur > 0) // 无论是否blur都绘制，保存canvas同步，其他地方比如crop可能用到
    // 避免模糊后的黑边
    if (this.node.getConf('blurEdgeFix')) this.drawCanvas(frame, null, true);
    view.source = this.drawCanvas(frame);
  }

  drawCanvas(img, canvas=null, disableBlur=false) {
    if (!canvas) canvas = this.canvas;
    if (!canvas) return; // may destroyed
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const { blur } = this; // blur
    if (blur > 0 && !disableBlur) ctx.filter = `blur(${blur}px)`;
    // 如果是ImageData, 直接put会覆盖老的内容，还可能让blur无效
    if (img instanceof ImageData) img = this.getImage(img);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  getImage(imgData) {
    if (imgData.constructor.name !== 'ImageData') return imgData;
    const canvas = this.initCanvas(imgData.width, imgData.height);
    canvas.getContext('2d').putImageData(imgData, 0, 0);
    return canvas;
  }

  initCanvas(w, h) {
    return settings.ADAPTER.createCanvas(w, h);
  }

  get width() {
    return this.info.width || 0;
  }

  get height() {
    return this.info.height || 0;
  }

  get blur() {
    // todo: blur也可能跟时间相关的keyframe动画？
    return this.node.getConf('blur') || 0;
  }

  destroy() {
    super.destroy();
    this.frameInfo = null;
    this.imageData = null;
    if (this.canvas) {
      this.canvas = null;
    }
    if (this.tmpCanvas) {
      this.tmpCanvas = null;
    }
  }
}

export default ImageMaterial;