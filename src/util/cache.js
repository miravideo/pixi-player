import XhrUtil from "./xhr";

const CacheUtil = {
  contentType(type) {
    return (type && type.includes('/')) ? `.${type.split('/')[1].toUpperCase()}` : '';
  },
  async cacheNode(node, cid, progress, force=false) {
    const { type, src, path, url, fontFamily, font, preload } = node.conf;
    let source = src || path || url;
    let fontUrl = font || fontFamily || '';
    if (type === 'text' && fontUrl.startsWith('http') && (force || preload !== false)) { // default preload=true
      const { url } = await XhrUtil.getCachedURL(fontUrl, cid, progress);
      node.conf.cachedFont = url;
    } else if (['image', 'gif'].includes(type) && source && (force || preload)) { // default preload=true
      const { url, type } = await XhrUtil.getCachedURL(source, cid, progress);
      node.conf.cachedSrc = url;
      node.conf.srcType = CacheUtil.contentType(type);
    } else if (['audio', 'video'].includes(type) && source && (force || preload)) { // default preload=false
      const { url } = await XhrUtil.getCachedURL(source, cid, progress);
      node.conf.cachedSrc = url;
      const paths = source.split('/');
      node.conf.srcFile = paths[paths.length - 1];
    }
  }
}

export default CacheUtil;