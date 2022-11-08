import Material from "./base";

class AudioMaterial extends Material {
  async init(onprogress) {
    await this.loadAudioBuffer((p) => {
      onprogress && onprogress(p);
    });
    if (!this.audioBuffer) return;
    this.info = { duration: this.audioBuffer.duration };
  }

}

export default AudioMaterial;