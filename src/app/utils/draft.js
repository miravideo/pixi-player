import md5 from 'md5';
import localforage from 'localforage';
import { uuid } from './data';

localforage.config({
  name: 'PIXI-Player-Draft',
  storeName: 'pixi_player_draft',
});

const PREFIX = '{{localfile}}';

const decodeLocalFile = (dict, files) => {
  if (!dict) return;
  for (const [k, v] of Object.entries(dict)) {
    if (v && typeof(v) === 'object') {
      decodeLocalFile(v, files);
    } else if (typeof(v) === 'string' && v.startsWith(PREFIX)) {
      const fk = v.replace(PREFIX, '');
      if (files[fk] instanceof Blob) {
        files[fk] = URL.createObjectURL(files[v.replace(PREFIX, '')]);
      }
      if (typeof(files[fk]) === 'string' && files[fk].startsWith('blob:')) {
        dict[k] = files[fk];
      }
    }
  }
}

const encodeLocalFile = async (dict, files={}) => {
  if (!dict) return;
  for (const [k, v] of Object.entries(dict)) {
    if (v && typeof(v) === 'object') {
      await encodeLocalFile(v, files);
    } else if (typeof(v) === 'string' && v.startsWith('blob:')) {
      const res = await fetch(v);
      const data = res && await res.blob();
      if (data) {
        const key = md5(v);
        files[key] = data;
        dict[k] = `${PREFIX}${key}`;
      }
    }
  }
  return [ dict, files ];
}

const Draft = {
  async list(sortBy='updated', asc='desc') {
    const lst = [];
    await localforage.iterate((item, key) => {
      item.key = key;
      lst.push(item);
    });
    const r = asc === 'asc' ? 1 : -1;
    lst.sort((a, b) => a[sortBy] === b[sortBy] ? 0 : (a[sortBy] > b[sortBy] ? 1 * r : -1 * r));
    return lst;
  },
  async delete(key) {
    await localforage.removeItem(key);
  },
  async load(key) {
    const item = await localforage.getItem(key);
    if (item.data && item.files) decodeLocalFile(item.data, item.files);
    return item;
  },
  async save(rootNode, item={}) {
    [item.data, item.files] = await encodeLocalFile(rootNode.toJson(true));
    const json = JSON.stringify(item.data);
    item.key = item.key || uuid();
    item.updated = Date.now();
    item.created = item.created || item.updated;
    item.image = await rootNode.previewImage(0.001, { width: 300, height: 300, fit: 'contain' });
    item.size = json.length + item.image.length + Object.values(item.files).reduce((a, b) => a + b.size, 0);
    item.duration = rootNode.duration;
    item.canvas = { width: rootNode.width, height: rootNode.height };
    // todo: more draft settings like fps...
    // console.log('item', item);
    // const img = document.createElement('img');
    // img.src = item.image;
    // document.body.append(img);
    localforage.setItem(item.key, item);
    // console.log('draft saved', item);
    return item;
  },
}

export default Draft;