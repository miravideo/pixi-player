'use strict';

const DataUtil = {
  zip: (keys, values) => {
    return Object.assign(...keys.map((k, i) => ({[k]: values[i]})));
  },
  ucfirst: (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  },
  dmap: (src, func, keys=[]) => {
    if (typeof(src) !== 'object') return func(src);
    const dst = Array.isArray(src) ? [] : {};
    const arr = Array.isArray(src) ? src.map((a, i) => [i, a]) : Object.entries(src);
    for (const [key, value] of arr) {
      const _keys = [...keys, key];
      if (typeof value === 'object') dst[key] = DataUtil.dmap(value, func, _keys);
      else dst[key] = func(value, key, _keys);
    }
    return dst;
  },
  uuid: () => {
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
  short: (str, max, tailLen=0) => {
    if (!str) return str;
    const strArr = Array.from(str);
    const len = strArr.length;
    if (len < max || max < tailLen) return str;
    const tail = tailLen > 0 ? strArr.slice(- tailLen).join('') : '';
    const head = strArr.slice(0, max - tailLen - 3).join('');
    return `${head}...${tail}`;
  }
}

module.exports = DataUtil;