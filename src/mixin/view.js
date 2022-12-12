import PluginUtil from '../util/plugin';

const aliasMapping = {
  'rotation': 'rotate',
  'alpha': 'opacity',
}

const ViewNode = {
  initHook(obj) {
    PluginUtil
      .wrap(obj.prototype, 'createView')
      .after(function (args, view) {
        return this._vn_updateViewAttr(view);
      });
    PluginUtil
      .wrap(obj.prototype, 'updateView')
      .after(function (args, view) {
        return this._vn_updateViewAttr(view);
      });
  },
  _vn_updateViewAttr(view) {
    if (!view || !view.attr) return;
    const keys = this.viewAttrKeys || ['x', 'y', 'width', 'height', 'anchor', 'scale', 'alpha', 'rotation', 'flipX', 'flipY'];
    const attrs = {};
    for (const key of keys) {
      let val = this.getConf(key);
      if (this.conf[key] === undefined && aliasMapping[key]) {
        const _val = this.getConf(aliasMapping[key]);
        if (_val !== undefined) {
          val = _val;
          // 把key改过去, alias只用来兼容老的数据一次性读取
          this.conf[key] = this.conf[aliasMapping[key]];
          delete this.conf[aliasMapping[key]];
        }
      }
      if (val !== undefined) attrs[key] = val;
    }
    view.attr(attrs);
    // console.log('ViewNode.updateViewAttr', this.id, view, attrs);
    return view;
  }
};

export default ViewNode;