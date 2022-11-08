import md5 from 'md5';
import localforage from 'localforage';
import Utils from './utils';
import Queue from './queue';

const q = new Queue();
const __cache = {};
const __req = {};
const __xhrs = {};
if (global) {
  global.PIXIPLR_XHRS = __xhrs;
  global.PIXIPLR_RESP_CACHE = __req;
}

// clear outdate cache
const now = Date.now();
localforage.iterate((item, key) => {
  if (now - item.updated < 15 * 86400 * 1000) return;
  localforage.removeItem(key);
});

async function getCache(cid, key) {
  // 用Queue来保证并发getCache的时候，得到的是同一个blob:URL
  return await q.enqueue(async () => {
    if (__cache[cid] && __cache[cid][key]) return __cache[cid][key];
    const res = await localforage.getItem(key);
    if (res && res.data) {
      if (!__cache[cid]) __cache[cid] = {};
      res.url = URL.createObjectURL(res.data);
      __cache[cid][key] = res;
    }
    return res;
  });
}

function setCache(cid, key, res) {
  if (!res || !res.data) return;
  res.updated = Date.now();
  localforage.setItem(key, {...res, url:null});
  res.url = URL.createObjectURL(res.data);
  if (!__cache[cid]) __cache[cid] = {};
  __cache[cid][key] = res;
}

const XhrUtil = {
  async clear(cid) {
    for (const [k, x] of Object.entries(__xhrs)) {
      if (cid === x._cid) x.abort();
      delete __xhrs[k];
    }
    for (const [k, x] of Object.entries(__req)) {
      const r = await x;
      if (cid === r.cid) delete __req[k];
    }
    if (__cache[cid]) {
      for (const [k, x] of Object.entries(__cache[cid])) {
        if (x.url) URL.revokeObjectURL(x.url);
      }
      delete __cache[cid];
    }
  },
  async getCachedURL(url, cid, progress=null) {
    const key = md5(url);
    let res = await getCache(cid, key);
    if (res && res.data) return res;
    res = await this.getRemote(url, cid, (p) => {
      const { total, loaded } = p;
      progress && progress({ key, total, loaded });
    });
    if (res.data) setCache(cid, key, res);
    return res;
  },
  async getRemote(url, cid, progress=null) {
    const key = md5(url);
    if (__req[key]) return __req[key];
    __req[key] = new Promise(function (resolve) {
      const uuid = Utils.genUuid();
      const xhr = new XMLHttpRequest();
      xhr.addEventListener("load", () => {
        delete __xhrs[uuid];
        const type = xhr.getResponseHeader('Content-Type');
        resolve({ data: xhr.response, type, cid });
      });
      xhr.addEventListener("error", e => {
        delete __xhrs[uuid];
        resolve({ url, cid });
      });
      xhr.addEventListener("abort", e => {
        delete __xhrs[uuid];
        resolve({ url, cid });
      });
      xhr.addEventListener("progress", p => {
        progress && progress(p);
      })
      // console.log('get remote!!', url);
      xhr.open("get", url);
      xhr.responseType = "blob";
      xhr._cid = cid;
      xhr.send();
      __xhrs[uuid] = xhr;
    });
    return __req[key];
  },
}

export default XhrUtil;