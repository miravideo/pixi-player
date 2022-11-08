import Container from './container';

class Cover extends Container {
  constructor(conf) {
    super({type: 'cover', ...conf});
  }

  get canvasEditNode() {
    return this.mask;
  }
}

export default Cover;