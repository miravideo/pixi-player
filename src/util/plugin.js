
function wrapper(hooks) {
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

const PluginUtil = {
  extends: ({plugin, to, override=false}) => {
    const keys = Object.keys(plugin);
    // console.log('extends', {keys, plugin, to, override});
    for (let i = 0; i < keys.length; ++i) {
      const propertyName = keys[i];
      const srcProperty = Object.getOwnPropertyDescriptor(plugin, propertyName);
      const toProperty = Object.getOwnPropertyDescriptor(to, propertyName)
       || (to.prototype && Object.getOwnPropertyDescriptor(to.prototype, propertyName));
      if (toProperty === srcProperty) continue;
      if (!override && toProperty) continue;
      if (to.prototype) {
        Object.defineProperty(to.prototype, propertyName, srcProperty);
      } else {
        Object.defineProperty(to, propertyName, srcProperty);
      }
    }
    if (plugin.initHook) plugin.initHook(to);
  },
  wrapAsync: (obj, funcName) => {
    const oriFunc = obj[funcName];
    const hooks = { before: [], after: [] };
    obj[funcName] = async function (...args) {
      for (const hook of hooks.before) {
        const _args = await hook.call(this, args);
        args = _args !== undefined ? _args : args;
      }
      let ret = await oriFunc.call(this, ...args);
      for (const hook of hooks.after) {
        const _ret = await hook.call(this, args, ret);
        ret = _ret !== undefined ? _ret : ret;
      }
      return ret;
    }
    return wrapper(hooks);
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
    return wrapper(hooks);
  }
}

export default PluginUtil;