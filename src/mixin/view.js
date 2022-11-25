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
    const keys = this.viewAttrKeys || ['x', 'y', 'width', 'height', 'anchor', 'scale', 'alpha', 'rotation'];
    const attrs = {};
    for (const key of keys) {
      let val = this.getConf(key);
      if (aliasMapping[key]) {
        const _val = this.getConf(aliasMapping[key]);
        if (_val !== undefined) val = _val;
      }
      if (val !== undefined) attrs[key] = val;
    }
    view.attr(attrs);
    // console.log('ViewNode.updateViewAttr', this.id, view, attrs);
    return view;
  }
};

export default ViewNode;