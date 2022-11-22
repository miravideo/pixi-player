'use strict';

const TimeUtil = {
  secToHmsf: (time, fps) => {
    const str = TimeUtil.secToHms(time, 3);
    if (!fps) throw new Error('fps error!');
    const ms = Number(str.substring(str.length - 3)) / 1000;
    return str.substring(0, str.length - 4) + ':' + Math.round(ms * fps).toString().padStart(2, '0');
  },
  secToHms: (time, decimal=0, full=false) => {
    time = time.toFixed(decimal);
    const hours = Math.floor(time / 3600).toString();
    let minutes = Math.floor((time - hours * 3600) / 60).toString();
    const showHour = hours > 0 || full;
    if (showHour) minutes = minutes.padStart(2, '0');
    let seconds = Math.floor(time - hours * 3600 - minutes * 60).toString();
    if (minutes.length > 0) seconds = seconds.padStart(2, '0');
    const miniSec = decimal > 0 ? (time - Math.floor(time)).toFixed(decimal).replace('0.', '.') : '';
    return `${showHour ? hours+':' : ''}${minutes}:${seconds}${miniSec}`;
  },
  sleep: (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
}

module.exports = TimeUtil;