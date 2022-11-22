'use strict';

const PluginUtil = {
  mixin: ({src, dst}) => {
    const keys = Object.keys(src);
    for (let i = 0; i < keys.length; ++i) {
      const propertyName = keys[i];
      const srcProperty = Object.getOwnPropertyDescriptor(src, propertyName);
      const dstProperty = Object.getOwnPropertyDescriptor(dst, propertyName);
      if (dstProperty === srcProperty) continue;
      Object.defineProperty(dst.prototype, propertyName, srcProperty);
    }
  },
  wrap: (obj, funcName) => {
    const oriFunc = obj[funcName];
    const hooks = { before: [], after: [] };
    obj[funcName] = function (...args) {
      hooks.before.map((hook) => {
        const _args = hook.call(this, args);
        args = _args !== undefined ? _args : args;
      });
      let ret = oriFunc.call(this, ...args);
      hooks.after.map((hook) => {
        const _ret = hook.call(this, args, ret);
        ret = _ret !== undefined ? _ret : ret;
      });
      return ret;
    }
    const wrapper = {
      before: (func) => hooks.before.push(func) && wrapper,
      after: (func) => hooks.after.push(func) && wrapper,
      revoke: () => {
        // obj[funcName] = oriFunc; // 不能重新赋值，不然可能把之后的wrap改了
        hooks.before = [];
        hooks.after = [];
      },
    };
    return wrapper;
  }
}

module.exports = PluginUtil;