import Container from './container';

class Div extends Container {
  constructor(conf) {
    super({type: 'div', ...conf});
  }

  // annotate(record) {
  //   super.annotate(record);
  //   // 如果没有改动自己的child，就重新绑定上
  //   if (this.getConf('group', false) && record && !record.nodes.some(n => this.hasChild(n))) {
  //     this.children.map(x => x.conf.groupId = this.id);
  //   }
  // }

  addChild(child, insertBefore=null) {
    super.addChild(child, insertBefore);
    if (this.getConf('group', false)) child.conf.groupId = this.id;
  }

  removeChild(child) {
    super.removeChild(child);
    if (this.getConf('group', false)) child.conf.groupId = undefined;
  }
}

export default Div;