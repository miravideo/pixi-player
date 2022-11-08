import Track from "./track";

class Spine extends Track {
  constructor(conf = {}) {
    super({ type: 'spine', ...conf });
  }
}

export default Spine;