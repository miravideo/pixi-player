var path          = require('path')
var ndarray       = require('ndarray')
var GifReader     = require('omggif').GifReader
var parseDataURI  = require('data-uri-to-buffer')

function defaultImage(url, cb) {
  var img = new Image()
  img.crossOrigin = "Anonymous"
  img.onload = function() {
    var canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    var context = canvas.getContext('2d')
    context.drawImage(img, 0, 0)
    var pixels = context.getImageData(0, 0, img.width, img.height)
    cb(null, ndarray(new Uint8Array(pixels.data), [img.width, img.height, 4], [4, 4*img.width, 1], 0))
  }
  img.onerror = function(err) {
    cb(err)
  }
  img.src = url
}

//Animated gif loading
function handleGif(data, cb) {
  var reader
  try {
    reader = new GifReader(data)
  } catch(err) {
    cb(err)
    return
  }
  if(reader.numFrames() > 0) {
    var nshape = [reader.numFrames(), reader.height, reader.width, 4]
    var ndata = new Uint8Array(nshape[0] * nshape[1] * nshape[2] * nshape[3])
    var result = ndarray(ndata, nshape)
    var frameInfo = []
    try {
      for(var i=0; i<reader.numFrames(); ++i) {
        reader.decodeAndBlitFrameRGBA(i, ndata.subarray(
          result.index(i, 0, 0, 0),
          result.index(i+1, 0, 0, 0)))
        frameInfo.push(reader.frameInfo(i))
      }
    } catch(err) {
      cb(err)
      return
    }
    cb(null, result.transpose(0,2,1), frameInfo)
  } else {
    var nshape = [reader.height, reader.width, 4]
    var ndata = new Uint8Array(nshape[0] * nshape[1] * nshape[2])
    var result = ndarray(ndata, nshape)
    try {
      reader.decodeAndBlitFrameRGBA(0, ndata)
    } catch(err) {
      cb(err)
      return
    }
    cb(null, result.transpose(1,0))
  }
}

function httpGif(url, cb) {
  var xhr          = new XMLHttpRequest()
  xhr.open('GET', url, true)
  xhr.responseType = 'arraybuffer'
  if(xhr.overrideMimeType){
    xhr.overrideMimeType('application/binary')
  }
  xhr.onerror = function(err) {
    cb(err)
  }
  xhr.onload = function() {
    if(xhr.readyState !== 4) {
      return
    }
    var data = new Uint8Array(xhr.response)
    handleGif(data, cb)
    return
  }
  xhr.send()
}

function copyBuffer(buffer) {
  if(buffer[0] === undefined) {
    var n = buffer.length
    var result = new Uint8Array(n)
    for(var i=0; i<n; ++i) {
      result[i] = buffer.get(i)
    }
    return result
  } else {
    return new Uint8Array(buffer)
  }
}

function dataGif(url, cb) {
  process.nextTick(function() {
    try {
      var buffer = parseDataURI(url)
      if(buffer) {
        handleGif(copyBuffer(buffer), cb)
      } else {
        cb(new Error('Error parsing data URI'))
      }
    } catch(err) {
      cb(err)
    }
  })
}

function getPixels(url, type, cb) {
  if (!cb) {
    cb = type
    type = ''
  }
  if (!url) return;
  var ext = path.extname(url)
  switch(type || ext.toUpperCase()) {
    case '.GIF':
      httpGif(url, cb)
    break
    default:
      if(url.indexOf('data:image/gif;') === 0) {
        dataGif(url, cb)
      } else {
        defaultImage(url, cb)
      }
  }
}

const ImageUtils = {
  async getPixels(url, type) {
    return new Promise((resolve, reject) => {
      getPixels(url, type, (err, pixels, frameInfo) => {
        if (err) return reject(err);
        resolve({ pixels, frameInfo });
      });
    });
  },
  subImage(src, frame, { width, height, format='jpeg', fit='cover', bgColor='#000000' }={}) {
    if (!frame && src.width && src.height) {
      frame = { x: 0, y: 0, w: src.width, h: src.height };
    }
    if (!width && !height) {
      width = frame.w;
      height = frame.h;
    } else if (!width) {
      width = (frame.w / frame.h) * height;
    } else if (!height) {
      height = (frame.h / frame.w) * width;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const f = (fit === 'cover' ? 'max' : 'min');
    if (f !== 'max') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);
    }
    const scale = Math[f](width / frame.w, height / frame.h);
    const [vw, vh] = [frame.w * scale, frame.h * scale];
    ctx.drawImage(src, frame.x, frame.y, frame.w, frame.h,
      (width - vw) / 2, (height - vh) / 2, vw, vh);
    return format === 'canvas' ? canvas : canvas.toDataURL(`image/${format}`);
  }
}

export default ImageUtils;