import { Text, TextMetrics, TextStyle, utils } from "pixi.js";
import Utils from "./utils";

const contextSettings = {
  willReadFrequently: true,
};

export class EditableTextMetrics extends TextMetrics {
  constructor(
    text, style, width, height, textWidth, textHeight, 
    lines, lineWidths, lineHeight, maxLineWidth, fontProperties
  ) {
    super(text, style, width, height, lines, lineWidths, lineHeight, maxLineWidth, fontProperties);
    this.textWidth = textWidth;
    this.textHeight = textHeight;
  }

  static measureText(text, style, wordWrap, canvas = TextMetrics._canvas) {
    wordWrap = (wordWrap === undefined || wordWrap === null) ? style.wordWrap : wordWrap;
    const font = style.toFontString();
    const fontProperties = TextMetrics.measureFont(font);

    // fallback in case UA disallow canvas data extraction
    // (toDataURI, getImageData functions)
    if (fontProperties.fontSize === 0) {
      fontProperties.fontSize = style.fontSize;
      fontProperties.ascent = style.fontSize;
    }

    const context = canvas.getContext('2d', contextSettings);
    context.font = font;

    let lines;
    if (wordWrap) {
      lines = EditableTextMetrics.wordWrap(text, style, canvas);
      // console.log('measureText', text, lines);
    } else {
      lines = text.split(/(?:\r\n|\r|\n)/).map(line => `${line}\n`);
    }

    let after = 0;
    // 最后会多一个\n，不去掉，但校验的时候不算
    const lastLine = lines[lines.length - 1];
    if (lastLine.endsWith('\n')) {
      after = -1;
      //lines[lines.length - 1] = lastLine.substring(0, lastLine.length - 1);
    }

    const before = Array.from(text).length;
    lines.map((l) => after += Array.from(l).length);
    if (before !== after) {
      console.error('text parse err!!!', {before, after}, Array.from(text), lines);
    } else {
      // console.log('text parse ok!!!', {before, after}, Array.from(text), lines);
    }

    const lineWidths = new Array(lines.length);
    let maxLineWidth = 0;

    for (let i = 0; i < lines.length; i++) {
      // 计算宽度的时候不考虑末尾空格和\n, 避免影响视觉居中
      const mText = lines[i].replaceAll(/[\s\n]+$/ig, '');
      const lineWidth = context.measureText(mText).width +
        (Array.from(mText).length - 1) * style.letterSpacing;
      lineWidths[i] = lineWidth;
      maxLineWidth = Math.max(maxLineWidth, lineWidth);
    }
    const textWidth = maxLineWidth + style.strokeThickness;
    let width = textWidth;
    if (style.dropShadow) {
      width += (style.dropShadowDistance + style.dropShadowBlur) * (style.align === 'center' ? 2 : 1);
    }

    const lineHeight = style.lineHeight || fontProperties.fontSize + style.strokeThickness;
    const textHeight = Math.max(lineHeight, fontProperties.fontSize + style.strokeThickness)
      + ((lines.length - 1) * (lineHeight + style.leading));
    let height = textHeight;
    if (style.dropShadow) {
      height += (style.dropShadowDistance + style.dropShadowBlur) * (style.valign === 'center' ? 2 : 1);
    }

    return new EditableTextMetrics(
      text,
      style,
      width,
      height,
      textWidth,
      textHeight,
      lines,
      lineWidths,
      lineHeight + style.leading,
      maxLineWidth,
      fontProperties
    );
  }

  static wordWrap(text, style, canvas = TextMetrics._canvas) {
    const context = canvas.getContext('2d', contextSettings);

    let width = 0;
    let line = "";
    let lines = [];

    const cache = {};
    const { letterSpacing, whiteSpace } = style;

    // How to handle whitespaces
    const collapseSpaces = TextMetrics.collapseSpaces(whiteSpace);
    const collapseNewlines = TextMetrics.collapseNewlines(whiteSpace);

    // whether or not spaces may be added to the beginning of lines
    let canPrependSpaces = !collapseSpaces;

    // There is letterSpacing after every char except the last one
    // t_h_i_s_' '_i_s_' '_a_n_' '_e_x_a_m_p_l_e_' '_!
    // so for convenience the above needs to be compared to width + 1 extra letterSpace
    // t_h_i_s_' '_i_s_' '_a_n_' '_e_x_a_m_p_l_e_' '_!_
    // ________________________________________________
    // And then the final space is simply no appended to each line
    const wordWrapWidth = style.wordWrapWidth + letterSpacing;

    // break text into words, spaces and newline chars
    const tokens = TextMetrics.tokenize(text);
    // tokens是完整text, 一个字符都不少的
    // console.log('tokens', wordWrapWidth, tokens, style);

    for (let i = 0; i < tokens.length; i++) {
      // get the word, space or newlineChar
      let token = tokens[i];
      // console.log('-----token', {i, token});

      // if word is a new line
      if (TextMetrics.isNewline(token)) {
        // keep the new line
        if (!collapseNewlines) {
          lines.push(EditableTextMetrics.addLine(line, 'T0'));
          canPrependSpaces = !collapseSpaces;
          line = "";
          width = 0;
          continue;
        }

        // if we should collapse new lines
        // we simply convert it into a space
        token = " ";
      }

      // if we should collapse repeated whitespaces
      if (collapseSpaces) {
        // check both this and the last tokens for spaces
        const currIsBreakingSpace = TextMetrics.isBreakingSpace(token);
        const lastIsBreakingSpace = TextMetrics.isBreakingSpace(
          line[line.length - 1]
        );

        if (currIsBreakingSpace && lastIsBreakingSpace) {
          continue;
        }
      }

      // get word width from cache if possible
      const tokenWidth = TextMetrics.getFromCache(
        token,
        letterSpacing,
        cache,
        context
      );

      // word is longer than desired bounds
      if (tokenWidth > wordWrapWidth) {
        // if we are not already at the beginning of a line
        if (line !== "") {
          // start newlines for overflow words
          lines.push(EditableTextMetrics.addLine(line, 'T1', false));
          line = "";
          width = 0;
        }

        // break large word over multiple lines
        if (TextMetrics.canBreakWords(token, style.breakWords)) {
          // break word into characters
          const characters = Array.from(token);
          // console.log('characters', characters);

          // loop the characters
          for (let j = 0; j < characters.length; j++) {
            let char = characters[j];

            let k = 1;
            // we are not at the end of the token

            // always break, not effect
            while (characters[j + k]) {
              const nextChar = characters[j + k];
              const lastChar = char[char.length - 1];

              // should not split chars
              if (
                !TextMetrics.canBreakChars(
                  lastChar,
                  nextChar,
                  token,
                  j,
                  style.breakWords
                )
              ) {
                // combine chars & move forward one
                char += nextChar;
              } else {
                break;
              }

              k++;
              j++;
            }

            const characterWidth = TextMetrics.getFromCache(
              char,
              letterSpacing,
              cache,
              context
            );

            if (characterWidth + width > wordWrapWidth) {
              lines.push(EditableTextMetrics.addLine(line, 'T2', false)); // 行内强制换行，不加\n
              canPrependSpaces = false;
              line = "";
              width = 0;
            }

            line += char;
            // console.log('333 line += token', {line, token});
            width += characterWidth;
          }
        }

        // run word out of the bounds
        else {
          // if there are words in this line already
          // finish that line and start a new one
          if (line.length > 0) {
            lines.push(EditableTextMetrics.addLine(line, 'T3', false));
            line = "";
            width = 0;
          }

          line = token;
          let j = i + 1;
          for (; j < tokens.length; j++) {
            if (TextMetrics.isBreakingSpace(tokens[j])) {
              line += tokens[j];
              i = j;
            } else {
              break;
            }
          }

          const isLastToken = i === tokens.length - 1;

          // give it its own line if it's not the end
          lines.push(EditableTextMetrics.addLine(line, 'T4', isLastToken));
          canPrependSpaces = false;
          line = "";
          width = 0;
        }
      }

      // word could fit
      else {
        // word won't fit because of existing words
        // start a new line
        if (tokenWidth + width > wordWrapWidth) {
          // if its a space we don't want it
          canPrependSpaces = false;

          // 一行末尾的空格，这里不加的话，下一行的开头也会丢弃
          while (TextMetrics.isBreakingSpace(token)) {
            line += token;
            // console.log('444 line += token', {line, token});
            token = tokens[++i];
            if (token === undefined) {
              token = '';
              break;
            }
          }

          // add a new line
          lines.push(EditableTextMetrics.addLine(line, 'T5', false)); // 行内强制换行，不加\n

          // start a new line
          line = "";
          width = 0;

          if (token) {
            // bugfix: 上面 ++i 之后的token可能很长, 需要重新计算
            i--;
            continue;
          }
        }

        // don't add spaces to the beginning of lines
        if (
          line.length > 0 ||
          !TextMetrics.isBreakingSpace(token) ||
          canPrependSpaces
        ) {
          // add the word to the current line
          line += token;
          // console.log('555 line += token', {line, token});

          // update width counter
          width += tokenWidth;
        }
      }
    }

    // console.log('line', line);
    if (line.length > 0) lines.push(EditableTextMetrics.addLine(line, 'T6'));

    // 把单个\n跟上一行结尾无\n的合并
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i].endsWith('\n') || lines[i+1] !== '\n') continue;
      lines[i] += lines[i+1];
      lines[i+1] = '';
    }

    return lines.filter(x => x.length > 0);
  }

  static addLine(line, tag, newLine=true) {
    // console.log('addLine', tag, {line, newLine});
    line = newLine ? `${line}\n` : line;
    return line;
  }
}

export class EditableTextStyle extends TextStyle {
  get valign() {
    return this._valign || 'top';
  }

  set valign(valign) {
    if (this._valign !== valign) {
      this._valign = valign;
      this.styleID++;
    }
  }

  get dropShadowContain() {
    return this._dropShadowContain;
  }

  set dropShadowContain(contain) {
    if (this._dropShadowContain !== contain) {
      this._dropShadowContain = contain;
      this.styleID++;
    }
  }

  get styleID() {
    return this._styleId;
  }

  set styleID(id) {
    this._styleId = id;
  }
}

export class EditableText extends Text {
  updateText(respectDirty) {
    const style = this._style;

    // check if style has changed..
    if (this.localStyleID !== style.styleID) {
      this.dirty = true;
      this.localStyleID = style.styleID;
    }

    if (!this.dirty && respectDirty) {
      return;
    }

    // console.log('updateText', style.styleID);

    this._font = this._style.toFontString();

    const context = this.context;
    const measured = EditableTextMetrics.measureText(this._text || ' ', this._style, this._style.wordWrap, this.canvas);

    const width = measured.width;
    const height = measured.height;
    const textWidth = measured.textWidth;
    const textHeight = measured.textHeight;
    const lines = measured.lines;
    const lineHeight = measured.lineHeight;
    const lineWidths = measured.lineWidths;
    const maxLineWidth = measured.maxLineWidth;
    const fontProperties = measured.fontProperties;

    // lineHeight for selection calc
    this.lineHeight = measured.lineHeight;

    // apply target width/height
    const mw = Math.ceil(Math.ceil((Math.max(1, style.dropShadowContain ? width : textWidth) + (style.padding * 2))) * this._resolution);
    const mh = Math.ceil(Math.ceil((Math.max(1, style.dropShadowContain ? height : textHeight) + (style.padding * 2))) * this._resolution);
    this.canvas.width = this.targetWidth || mw;
    this.canvas.height = this.targetHeight || mh;
    // console.log({mw, tw: this.targetWidth});

    let alignOffsetX = 0, alignOffsetY = 0;
    if (style.align === 'right') {
      alignOffsetX = this.canvas.width - textWidth;
    } else if (style.align === 'center') {
      alignOffsetX = (this.canvas.width - textWidth) / 2;
    }
    if (style.valign === 'bottom') {
      alignOffsetY = this.canvas.height - textHeight;
    } else if (style.valign === 'center') {
      alignOffsetY = (this.canvas.height - textHeight) / 2;
    }

    context.scale(this._resolution, this._resolution);
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);

    context.font = this._font;
    context.lineWidth = style.strokeThickness;
    context.textBaseline = style.textBaseline;
    context.lineJoin = style.lineJoin;
    context.miterLimit = style.miterLimit;

    // require 2 passes if a shadow; the first to draw the drop shadow, the second to draw the text
    const passesCount = style.dropShadow ? 2 : 1;

    // for selection
    const chars = [];

    // For v4, we drew text at the colours of the drop shadow underneath the normal text. This gave the correct zIndex,
    // but features such as alpha and shadowblur did not look right at all, since we were using actual text as a shadow.
    //
    // For v5.0.0, we moved over to just use the canvas API for drop shadows, which made them look much nicer and more
    // visually please, but now because the stroke is drawn and then the fill, drop shadows would appear on both the fill
    // and the stroke; and fill drop shadows would appear over the top of the stroke.
    //
    // For v5.1.1, the new route is to revert to v4 style of drawing text first to get the drop shadows underneath normal
    // text, but instead drawing text in the correct location, we'll draw it off screen (-paddingY), and then adjust the
    // drop shadow so only that appears on screen (+paddingY). Now we'll have the correct draw order of the shadow
    // beneath the text, whilst also having the proper text shadow styling.
    const dropShadowBlur = style.dropShadowBlur * this._resolution;
    const dropShadowDistance = style.dropShadowDistance * this._resolution;

    // 保证阴影能完整绘制出来
    let dsOffsetX = - Math.cos(style.dropShadowAngle) * dropShadowDistance;
    if (style.align === 'right' && style.dropShadowContain) {
      dsOffsetX = Math.min(dsOffsetX, 0);
    } else if (style.align === 'left' && style.dropShadowContain) {
      dsOffsetX = Math.max(dsOffsetX, 0);
    } else {
      dsOffsetX = 0;
    }

    let dsOffsetY = - Math.sin(style.dropShadowAngle) * dropShadowDistance;
    if (style.valign === 'bottom' && style.dropShadowContain) {
      dsOffsetY = Math.min(dsOffsetY, 0);
    } else if (style.valign === 'top' && style.dropShadowContain) {
      dsOffsetY = Math.max(dsOffsetY, 0);
    } else {
      dsOffsetY = 0;
    }

    let paddingOffsetX = 0;
    if (style.align === 'right') {
      paddingOffsetX = - style.padding;
    } else if (style.align === 'left') {
      paddingOffsetX = style.padding;
    }

    let paddingOffsetY = 0;
    if (style.valign === 'bottom') {
      paddingOffsetY = - style.padding;
    } else if (style.valign === 'top') {
      paddingOffsetY = style.padding;
    }

    let linePositionYShift = (lineHeight - fontProperties.fontSize) / 2;
    if (lineHeight - fontProperties.fontSize < 0) {
      linePositionYShift = 0;
    }

    let linePositionX;
    let linePositionY;

    this.offsetX = alignOffsetX + paddingOffsetX + dsOffsetX + (style.strokeThickness / 2);
    this.offsetY = alignOffsetY + paddingOffsetY + dsOffsetY + (style.strokeThickness / 2) + linePositionYShift;

    // background
    this.drawBackground(style);

    // selection
    this.drawSelection();

    for (let i = 0; i < passesCount; ++i) {
      const isShadowPass = style.dropShadow && i === 0;
      // we only want the drop shadow, so put text way off-screen
      const dsOffsetText = isShadowPass ? this.canvas.height * 2 : 0;
      const dsOffsetShadow = dsOffsetText * this._resolution; // offsetY

      if (isShadowPass) {
        // On Safari, text with gradient and drop shadows together do not position correctly
        // if the scale of the canvas is not 1: https://bugs.webkit.org/show_bug.cgi?id=197689
        // Therefore we'll set the styles to be a plain black whilst generating this drop shadow
        context.fillStyle = 'black';
        context.strokeStyle = 'black';

        const dropShadowColor = style.dropShadowColor;
        const rgb = utils.hex2rgb(typeof dropShadowColor === 'number'
            ? dropShadowColor
            : utils.string2hex(dropShadowColor));

        context.shadowColor = `rgba(${rgb[0] * 255},${rgb[1] * 255},${rgb[2] * 255},${style.dropShadowAlpha})`;
        context.shadowBlur = dropShadowBlur;
        context.shadowOffsetX = Math.cos(style.dropShadowAngle) * dropShadowDistance;
        context.shadowOffsetY = (Math.sin(style.dropShadowAngle) * dropShadowDistance) + dsOffsetShadow;
      } else {
        // set canvas text styles
        context.fillStyle = this._generateFillStyle(style, lines, measured);
        // TODO: Can't have different types for getter and setter. The getter shouldn't have the number type as
        //       the setter converts to string. See this thread for more details:
        //       https://github.com/microsoft/TypeScript/issues/2521
        context.strokeStyle = style.stroke;

        context.shadowColor = 'black';
        context.shadowBlur = 0;
        context.shadowOffsetX = 0;
        context.shadowOffsetY = 0;
      }

      // draw lines line by line
      for (let i = 0; i < lines.length; i++) {
        linePositionX = this.offsetX;
        linePositionY = this.offsetY + (i * lineHeight) + fontProperties.ascent;

        if (style.align === 'right') {
          linePositionX += maxLineWidth - lineWidths[i];
        } else if (style.align === 'center') {
          linePositionX += (maxLineWidth - lineWidths[i]) / 2;
        }

        if (style.stroke && style.strokeThickness) {
          this.drawLetterSpacing(
            lines[i],
            linePositionX,
            linePositionY - dsOffsetText,
            true
          );
        }

        if (style.fill) {
          const lastLine = chars[chars.length - 1];
          const lastCharIdx = lastLine ? lastLine[lastLine.length - 1].ci : -1;
          const lineChars = this.drawLetterSpacing(
            lines[i],
            linePositionX,
            linePositionY - dsOffsetText,
            false, 
            lastCharIdx + 1
          );

          if (!isShadowPass) {
            chars.push(lineChars);
          }
        }
      }
    }

    // set chars for selection
    this.chars = chars;

    this.updateTexture();
  }

  updateTexture() {
    const canvas = this.canvas;

    if (this._style.trim) {
      const trimmed = utils.trimCanvas(canvas);
      if (trimmed.data) {
        canvas.width = trimmed.width;
        canvas.height = trimmed.height;
        this.context.putImageData(trimmed.data, 0, 0);
      }
    }

    const texture = this._texture;
    const style = this._style;
    // padding 不要去resize？
    const padding = 0; // style.trim ? 0 : style.padding;
    const baseTexture = texture.baseTexture;

    texture.trim.width = texture._frame.width = canvas.width / this._resolution;
    texture.trim.height = texture._frame.height = canvas.height / this._resolution;
    texture.trim.x = -padding;
    texture.trim.y = -padding;

    texture.orig.width = texture._frame.width - (padding * 2);
    texture.orig.height = texture._frame.height - (padding * 2);

    // call sprite onTextureUpdate to update scale if _width or _height were set
    this._onTextureUpdate();

    baseTexture.setRealSize(canvas.width, canvas.height, this._resolution);

    texture.updateUvs();

    this.dirty = false;
  }

  drawLetterSpacing(text, x, y, isStroke=false, ci=0) {
    const style = this._style;
    const letterSpacing = style.letterSpacing;

    const characters = Array.from(text);
    let currentPosition = x;
    let index = 0;
    let current = "";
    let previousWidth = this.context.measureText(text).width;
    let currentWidth = 0;

    const chars = [];
    while (index < characters.length) {
      current = characters[index++];
      x = currentPosition;
      if (isStroke) {
        this.context.strokeText(current, x, y);
      } else {
        this.context.fillText(current, x, y);
      }

      currentWidth = this.context.measureText(characters.slice(index).join('')).width;
      currentPosition += previousWidth - currentWidth + letterSpacing;
      previousWidth = currentWidth;
      const right = currentPosition - (letterSpacing * 0.5);
      chars.push({ char: current, ci, top: y, left: x, right, cx: 0.5 * (x + right) });
      ci++;
    }
    return chars;
  }

  get style() {
    return this._style;
  }

  set style(style) {
    style = style || {};
    if (style instanceof EditableTextStyle) {
      this._style = style;
    } else {
      this._style = new EditableTextStyle(style);
    }
    this.localStyleID = -1;
    this.dirty = true;
  }

  drawBackground(style) {
    const background = style.background || style.backgroundColor;
    if (!background) return;

    const { context, canvas, text } = this;
    const ftext = String(text).trim();
    if (ftext) {
      context.fillStyle = background;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  drawSelection() {
    if (!this.selectionStart || !this.selectionEnd) {
      this.selection = null;
      return;
    }
    const height = this.lineHeight;
    // make sure start < end;
    const [ start, end ] = (this.selectionStart.lineIdx < this.selectionEnd.lineIdx
       || (this.selectionStart.lineIdx == this.selectionEnd.lineIdx && this.selectionStart.charIdx <= this.selectionEnd.charIdx))
        ? [this.selectionStart, this.selectionEnd] : [this.selectionEnd, this.selectionStart];

    this.selection = {start, end};
    for (let li = start.lineIdx; li <= end.lineIdx; li++) {
      const charStart = li === start.lineIdx ? start.x : 
        (this.chars[li][0]?.left || 0); // todo: align center / right
      const charEnd = li === end.lineIdx ? end.x : 
        (this.chars[li][this.chars[li].length - 1]?.right || 0);
      this.context.fillStyle = this._style.selectionBgColor;
      this.context.fillRect(charStart, this.offsetY + (li * height), charEnd - charStart, height);
    }
  }

  selectStart(point) {
    this.selectionStart = this.indexOf(point, 'selectStart');
    this.selectionEnd = null;
  }

  selectEnd(point) {
    this.selectionEnd = this.indexOf(point, 'selectEnd');
    this.cursorPoint = { x: this.selectionEnd.x, y: this.selectionEnd.y + 1};
    this.updateText(false);
  }

  selectMove(x, y, withShift, withCtrl) {
    if (!this.selectionEnd) return; // todo: select 0 as default
    if (x !== 0) {
      let point;
      if (!withShift && this.selection && this.selection.start.ci < this.selection.end.ci) {
        // 有选中的时候，键盘移动先把光标移到选中区域的开头/末尾
        const sel = this.selection[x > 0 ? 'end' : 'start'];
        point = { x: sel.x, y: sel.y + 1 };
      } else if (!withCtrl && x < 0 && this.selectionEnd.charIdx <= 0) {
        // prev line
        if (this.selectionEnd.lineIdx > 0) {
          const prevLine = this.chars[this.selectionEnd.lineIdx - 1];
          const lastChar = prevLine[prevLine.length - 1];
          // 上一行的lastChar可能是\n，也可能是强制换行的字符，都需要到【左边】
          point = { x: lastChar.left, y: lastChar.top + 1 };
          // console.log('selectMove', lastChar, point);
        }
      } else if (!withCtrl && x > 0 && this.selectionEnd.charIdx >= this.textLine(this.selectionEnd.lineIdx).length) {
        // next line
        if (this.selectionEnd.lineIdx + 1 < this.chars.length) {
          const line = this.chars[this.selectionEnd.lineIdx];
          // 判断是否有强制换行
          const key = (line[line.length - 1].char !== '\n') ? 'right' : 'left';
          const nextLine = this.chars[this.selectionEnd.lineIdx + 1];
          const firstChar = nextLine[0];
          point = { x: firstChar[key], y: firstChar.top + 1 };
        }
      } else {
        let charIdx = this.selectionEnd.charIdx + (x > 0 ? 1 : -1);
        const line = this.textLine(this.selectionEnd.lineIdx);
        // 跳到开头、末尾
        if (withCtrl) charIdx = x > 0 ? line.length : 0;
        // 最后一个字符
        const key = charIdx >= line.length ? 'right' : 'left';
        const char = line[Math.min(charIdx, line.length - 1)];
        point = { x: char[key], y: char.top + 1 };
      }

      if (point) {
        this.cursorPoint = point;
        this.selectionEnd = this.indexOf(point, 'selectMove.x');
      }
    } else {
      let i = this.selectionEnd.lineIdx + (y > 0 ? 1 : -1);
      let pX = this.cursorPoint.x;
      if (withCtrl) { // leftTop / rightBottom
        i = y > 0 ? this.chars.length : 0; 
        pX = y > 0 ? this.width : 0;
      }
      this.selectionEnd = this.indexOf({ x: pX, y: this.offsetY + this.lineHeight * i + 1 }, 'selectMove.y');
    }

    // cursor move, without shift
    if (!withShift) this.selectionStart = this.selectionEnd;

    this.updateText(false);
  }

  textLine(lineIdx) {
    return this.chars[lineIdx].filter(x => x.char != '\n');
  }

  indexOf(point, debug) {
    const lineIdx = Math.max(0, Math.min(this.chars.length - 1, Math.floor((point.y - this.offsetY) / this.lineHeight)));
    // console.log({otop: this.offsetY, lineIdx}, point, debug);
    let charIdx = 0;
    let ci = this.chars[lineIdx][0] ? this.chars[lineIdx][0].ci : 0;
    let x = this.chars[lineIdx][0] ? this.chars[lineIdx][0].left : 0;
    for (const char of this.chars[lineIdx]) {
      if (char.char === '\n') continue;
      if (point.x < char.cx) break;
      charIdx++;
      x = char.right;
      ci = char.ci + 1;
    }
    const height = this.lineHeight;
    return { lineIdx, charIdx, ci, x, y: this.offsetY + (lineIdx * height), height };
  }

  cursor(ci) {
    let index = ci;
    if (ci === undefined) index = this.selectionEnd.ci;
    // console.log('cursor', {index, ci}, Array.from(this.text).length);
    let char = this.charOf(index);
    let key = 'left';
    if (!char) {
      const lastLine = this.chars[this.chars.length - 1];
      char = lastLine[lastLine.length - 1];
      key = 'right';
    }

    // todo: 如果不更新selectionEnd，会导致删除/编辑后的光标位置有问题
    const end = this.indexOf({ x: char[key], y: char.top + 1 }, 'cursor');
    if (end.ci === this.selectionEnd.ci && end.x !== this.selectionEnd.x) {
      // 强制换行会带来不一致的情况（光标移动到上一行的结尾时，光标会出现在下一行开头），需要更新
      this.cursorPoint = { x: end.x, y: end.y };
    }
    this.selectionEnd = end;
    if (ci === undefined) return this.selectionEnd; // get
    this.selectionStart = this.selectionEnd; // set
  }

  input(val) {
    const { text, cursorIndex: ci } = this.delete(false); // remove selection
    const strs = Array.from(text);
    strs.splice(ci, 0, val);
    return { text: strs.join(''), cursorIndex: ci + Array.from(val).length };
  }

  delete(force=true) {
    const strs = Array.from(this.text);
    let start = this.selection.start.ci - 1;
    let count = 1;
    let cursor = this.selectionEnd;
    if (this.selection && this.selection.start.ci < this.selection.end.ci) {
      start = this.selection.start.ci;
      count = this.selection.end.ci - this.selection.start.ci;
      cursor = this.selection.end; // 确保是后边那个
      this.selectionStart = this.selectionEnd = cursor; // 去掉选中
    } else if (!force || !cursor || cursor.ci < 1) {
      return { text: this.text, cursorIndex: cursor ? cursor.ci : strs.length + 1 };
    }
    // 从数组中删除
    strs.splice(start, count);

    // 找到当前光标右边的char
    let line = this.chars[cursor.lineIdx];
    let key = cursor.charIdx < line.length ? 'left' : 'right';
    let char = line[Math.min(cursor.charIdx, line.length - 1)];
    if (key === 'right' && this.chars[cursor.lineIdx + 1]
       && this.chars[cursor.lineIdx + 1][0]) {
      char = this.chars[cursor.lineIdx + 1][0];
      key = 'left';
    }

    const cursorIndex = char.ci + (key === 'right' ? 1 : 0) - count;
    return { text: strs.join(''), cursorIndex };
  }

  charOf(ci) {
    for (const line of this.chars) {
      for (const char of line) {
        if (char.ci === ci) return char;
      }
    }
  }

  selectionText() {
    if (this.selection && this.selection.start.ci < this.selection.end.ci) {
      const strs = Array.from(this.text);
      return strs.slice(this.selection.start.ci, this.selection.end.ci).join('');
    }
    return '';
  }
}
