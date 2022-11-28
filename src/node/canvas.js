import Container from './container';
import Spine from './spine';

const DEFAULT_CONF = {
  'fps': 24, 
};

class Canvas extends Container {
  constructor(conf) {
    super({type: 'canvas', ...conf});

    this.width = conf.width;
    this.height = conf.height;
  }

  root() {
    return this;
  }

  get player() {
    return this._player;
  }

  set player(plyr) {
    this._player = plyr;
  }

  defaultVal(key) {
    if (DEFAULT_CONF[key] !== undefined) {
      return DEFAULT_CONF[key];
    }
    return super.defaultVal(key);
  }

  get absStartTime() {
    return 0; // for root set
  }

  preload() {
    this.initSpine();
    this.initzIndex();
  }

  initSpine() {
    let spine = this.children.filter(x => x?.type === 'spine');
    if (spine.length > 1) throw new Error('Num of Spine must only one!');
    if (spine.length === 0) {
      const tracks = this.children.filter(x => x?.type === 'track');
      if (tracks.length > 0) throw new Error('Track should not exists when Spine absence!');
      spine = new Spine();
      spine.parent = this;
      const _children = [spine];
      this.children.map(child => {
        // 没有开始时间的video都移到spine里
        if (child.type === 'video' && !child.conf.start) spine.addChild(child);
        else _children.push(child);
      });
      this.children = _children;
    }
  }

  initzIndex() {
    let zIndex = 0;
    const walkzIndex = (node) => {
      node.children.map(x => {
        x.zIndex = x.basezIndex + (zIndex++);
        // if (!x.conf.zIndex) x.conf.zIndex = x.zIndex;
        walkzIndex(x);
      });
    }
    walkzIndex(this);
  }

  getViewParent(time, type) {
    return null;
  }

  set duration(v) {
    this._duration = v;
  }

  get duration() {
    return this._duration;
  }

  annotate() {
    // this.initzIndex(); // 重新刷一下zIndex
    const spine = this.children.filter(x => x.type === 'spine')[0];
    spine.annotate(); // 必须重新annotate，确保正确
    let maxEndTime = spine.duration;
    // todo: 如果spine里有一个无限循环的，怎么搞？
    this.allNodes // 计算所有video元素(loop以外)的最后结束时间
    // .filter(x => (!x.isVirtual && (!x.loop || x.conf.duration || x.conf.end)))
      .filter(x => !x.isVirtual && !x.flexibleDuration)
      .map(x => maxEndTime = Math.max(maxEndTime, x.absEndTime));
    let isChanged = false;
    if (maxEndTime !== this.duration) {
      isChanged = true;
      this.duration = maxEndTime;
    }
    // 可能有child依赖于此, 需要再annotate一下
    this.allNodes.map(node => {
      node.annotate();
    });

    // 更新一下显示
    this.updatezIndex();
    if (isChanged && this.canplay) {
      // update metadata
      this.emit({
        type: 'loadedmetadata',
        duration: this.duration,
        width: this.width,
        height: this.height,
      });
    }

    this.onDraw = () => true;
  }

  updatezIndex() {
    this.allNodes.map(n => {
      if (n.updatezIndex) n.updatezIndex();
    });
    super.updatezIndex();
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.clearViewCache();
    this.allNodes.map(n => n.clearViewCache());
  }

  toMiraML(asTemplate=true, indent=2) {
    this.XML_INDENT = indent;
    const conf = this.toJson(asTemplate);
    const attr = ['version="1.1"'];
    for (const key of ['author', 'name', 'description']) {
      if (!conf[key]) continue;
      attr.push(`${key}="${conf[key]}"`);
      delete conf[key];
    }
    return `<miraml ${attr.join(' ')}>\n${this.xml(conf, indent)}</miraml>`;
  }

  xml(json, indent, tag=null) {
    const tagname = tag || json.type;
    if (!tagname || !json) return ''; // error!
    const subindt = indent + this.XML_INDENT;
    const attrs = [];
    const children = json.children && Array.isArray(json.children) ?
      json.children.map(x => this.xml(x, subindt)) : [];
    if (json.type === 'text' && json.text) {
      // hardcode
      children.push(`${" ".repeat(subindt)}<content>${json.text}</content>\n`);
      delete json.text;
      delete json.content;
    }
    for (let [k, v] of Object.entries(json)) {
      if (['type', 'children'].includes(k)) continue;
      if (Array.isArray(v)) {
        v = v.map(x => {
          if (typeof(x) !== 'object') return x;
          children.push(this.xml(x, subindt, k));
          return null;
        }).filter(x => x !== null);
        if (v.length > 0) {
          attrs.push(`${k}="${JSON.stringify(v)}"`);
        }
      } else if (typeof(v) === 'object') {
        children.push(this.xml(v, subindt, k));
      } else if (v !== null && v !== undefined) {
        attrs.push(`${k}="${v}"`);
      }
    }

    const idt = " ".repeat(indent);
    const att = `${attrs.length ? ' ' : ''}${attrs.join(' ')}`;
    const cld = children.join("");

    if (!cld) {
      return `${idt}<${tagname}${att}></${tagname}>\n`;
    }

    return `${idt}<${tagname}${att}>\n${cld}${idt}</${tagname}>\n`;
  }

  toJson(asTemplate=false) {
    const conf = super.toJson(asTemplate);
    conf.type = 'canvas';
    // 烧录需要duration
    if (!asTemplate) conf.duration = this.duration;
    return conf;
  }
}

export default Canvas;