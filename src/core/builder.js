import XMLParser from '../util/xml';

import Canvas from "../node/canvas";
import Filter from "../node/filter";
import Track from "../node/track";
import Spine from "../node/spine";
import Transition from "../node/transition";
import Image from "../node/image";
import Display from "../node/display";
import Video from "../node/video";
import Scene from "../node/scene";
import Container from "../node/container";
import Cover from "../node/cover";
import Mixin from "../node/mixin";
import Audio from "../node/audio";
import Graph from "../node/graph";
import Div from "../node/div";
import Loop from "../node/loop";
import Text from "../node/text";
import Watermark from '../node/watermark';

const TYPES = {
  display: Display,
  canvas: Canvas,
  spine: Spine,
  trans: Transition,
  image: Image,
  video: Video,
  filter: Filter,
  track: Track,
  container: Container,
  div: Div,
  loop: Loop,
  scene: Scene,
  cover: Cover,
  audio: Audio,
  graph: Graph,
  text: Text,
  watermark: Watermark,
}

const Builder = {
  cacheNode: null,
  mixin: {},
  parseAttribute(json, value) {
    const { children, ...attrs } = json;
    for (let child of children) {
      attrs[child.type] = this.parseAttribute(child, attrs[child.type]);
    }
    if (value && Array.isArray(value) && value.length > 0) {
      value.push(attrs);
      return value;
    } else if (value) {
      return [value, attrs];
    } else {
      return attrs;
    }
  },
  nodeClass(type) {
    return TYPES[type];
  },
  fromJson(json, cachePromise, progress, parent) {
    const { type, children = [], ...others } = json;

    // for child xml-node as attribute
    for (let child of children) {
      const key = child._nodeName || child.type;
      if (this.nodeClass(key)) continue; // 正常node
      // assign as attribute
      others[key] = this.parseAttribute(child, others[key]);
    }

    const klass = this.nodeClass(type);
    const node = new klass({...others, _type: type});
    if (parent) parent.addChild(node);
    if (node instanceof Mixin) {
      cachePromise.push(node.initMixin(type, this.mixin[type]));
    }

    for (let child of children) {
      const key = child._nodeName || child.type;
      if (!this.nodeClass(key)) continue;
      this.fromJson(child, cachePromise, progress, node);
    }

    if (this.cacheNode && typeof(this.cacheNode) === 'function') {
      cachePromise.push(this.cacheNode(node, 'builder', progress, true));
    }
    return node;
  },
  regMixin(mixins) {
    for (const type of Object.keys(mixins)) {
      this.mixin[type] = mixins[type];
      TYPES[type] = Mixin;
    }
  },
  genNode(data, opt, progress) {
    const cachePromise = [];
    const node = this.fromJson({ ...data, ...opt }, cachePromise, progress);
    return { node, cachePromise: Promise.all(cachePromise) };
  },
  fromXml(xml, opt, progress) {
    const data = XMLParser.parseXml(xml);
    return this.genNode(data, opt, progress);
  },
  from(value, opt, progress=null) {
    if (typeof value === 'string' && value.trim().startsWith('<')) { // xml
      return this.fromXml(value, opt, progress);
    }
    if (typeof value === 'string' && value.trim().startsWith('{')) { // json string
      value = JSON.parse(value);
    }
    if (value instanceof Object) {
      if (Array.isArray(value)) value = { type: 'node', children:value };
      return this.genNode(value, opt, progress);
    }
    throw new Error('invalid value');
  }
}

export default Builder;