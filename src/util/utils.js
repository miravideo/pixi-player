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
    let d = new Date().getTime();//Timestamp
    let d2 = ((typeof performance !== 'undefined') && performance.now && (performance.now()*1000)) || 0;//Time in microseconds since page-load or 0 if unsupported
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        let r = Math.random() * 16;//random number between 0 and 16
        if (d > 0) {//Use timestamp until depleted
            r = (d + r)%16 | 0;
            d = Math.floor(d/16);
        } else {//Use microseconds since page-load if supported
            r = (d2 + r)%16 | 0;
            d2 = Math.floor(d2/16);
        }
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    }).toUpperCase();
  },

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  storage: {},
};

export default Utils;