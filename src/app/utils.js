
export default {
  innerSize(element) {
    const computed = window.getComputedStyle(element);
    const paddingVer = parseInt(computed.paddingTop) + parseInt(computed.paddingBottom);
    const paddingHor = parseInt(computed.paddingLeft) + parseInt(computed.paddingRight);
    const width = element.clientWidth - paddingHor;
    const height = element.clientHeight - paddingVer;
    return { width, height };
  },
  formatTime(time, decimal=0) {
    time = time.toFixed(decimal);
    const hours = Math.floor(time / 3600).toString();
    let minutes = Math.floor((time - hours * 3600) / 60).toString();
    if (hours > 0) minutes = minutes.padStart(2, '0');
    let seconds = Math.floor(time - hours * 3600 - minutes * 60).toString();
    if (minutes.length > 0) seconds = seconds.padStart(2, '0');
    const miniSec = decimal > 0 ? (time - Math.floor(time)).toFixed(decimal).replace('0.', '.') : '';
    return `${hours>0 ? hours+':' : ''}${minutes}:${seconds}${miniSec}`;
  }
}