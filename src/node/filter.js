import Clip from '../core/clip';
import XhrUtil from '../util/xhr';
import SimpleFilter from '../util/filter';

class Filter extends Clip {
  constructor(conf) {
    super({...conf, type: 'filter'});
  }

  get vert() {
    return this.vertShader || this.getConf('vert');
  }

  get frag() {
    return this.fragShader || this.getConf('frag');
  }

  get render() {
    return this.renderShader || this.getConf('render') || this.conf.src;
  }

  get vars() {
    return this.getConf('vars');
  }

  async preload(onprogress) {
    for (const key of ['vert', 'frag', 'render']) {
      const val = this.getConf(key);
      if (typeof(val) !== 'string' || !val.startsWith('http')) continue;
      const res = await XhrUtil.getRemote(this[key], this.player.id, (p) => {
        const { total, loaded } = p;
        total && onprogress && onprogress(loaded / total);
      });
      this[`${key}Shader`] = await res.data.text();
    }
  }

  getViewParent(time, type) {
    return this.parent.getView(time, type);
  }

  async draw(absTime, type) {
    const view = await super.draw(absTime, type);
    if (view) {
      // update time
      view.setTime(absTime - this.absStartTime, this.duration);
    }
    return view;
  }

  createView() {
    return new SimpleFilter({ 
      key: this.id, vars: this.vars, 
      // shader code: render
      render: this.render, 
      // shaders
      vert: this.vert, frag: this.frag, 
    });
  }

}

export default Filter;