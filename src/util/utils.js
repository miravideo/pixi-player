const cache = {};

const Utils = {
  isUA(key) {
    return navigator && navigator.userAgent.toLowerCase().includes(key.toLowerCase());
  },

  isMoble() {
    const ua = navigator && navigator.userAgent.toLowerCase();
    return (/mobile|android|iphone|ipad|phone/i.test(ua));
  },

  isWeChat() {
    return this.isUA('micromessenger');
  },

  deql(src, dst) {
    return Object.entries(dst).every(([k, v]) => src[k] == v);
  },

  dmap(src, func, keys=[]) {
    const dst = Array.isArray(src) ? [] : {};
    const arr = Array.isArray(src) ? src.map((a, i) => [i, a]) : Object.entries(src);
    for (const [key, value] of arr) {
      const _keys = [...keys, key];
      if (typeof value === 'object') dst[key] = this.dmap(value, func, _keys);
      else dst[key] = func(value, key, _keys);
    }
    return dst;
  },

  genId(type) {
    if (cache[type] === undefined) cache[type] = 1;
    return type + '_' + String(cache[type]++);
  },

  genUuid() {
    return (
      Math.random()
        .toString(36)
        .substr(-8) +
      Math.random()
        .toString(36)
        .substr(-8)
    );
  },

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  storage: {},
};

export default Utils;