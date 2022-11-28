import Clip from '../core/clip';
import AudioMaterial from '../material/audio';

class Audio extends Clip {
  constructor(conf) {
    super({type: 'audio', ...conf});
  }

  get hasAudio() {
    return !this.getConf('muted');
  }

  async preload(onprogress) {
    if (this.material) this.material.destroy();
    this.material = new AudioMaterial(this);
    await this.material.init(onprogress);
  }
}

export default Audio;