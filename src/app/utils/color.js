'use strict';
const tinycolor = require("tinycolor2");

const ColorUtil = {
  color: (c, alpha) => {
    return tinycolor(c).setAlpha(alpha / 100).toRgbString();
  }
}

module.exports = ColorUtil;