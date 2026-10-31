export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败'));
    image.src = src;
  });
}

function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.9) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('图片处理失败'));
    }, type, quality);
  });
}

export async function compressImageFile(file, { maxSize = 2000, quality = 0.88, type = 'image/jpeg' } = {}) {
  if (!file) return null;
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#fffdf8';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(image, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, type, quality);
    const name = (file.name || 'image').replace(/\.[^.]+$/, '') + (type === 'image/png' ? '.png' : '.jpg');
    return new File([blob], name, { type });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * 从原图中裁剪归一化区域 [x, y, w, h]，返回 Blob。
 */
export async function cropImageRegion(src, bbox, { maxWidth = 1600, quality = 0.92 } = {}) {
  const image = await loadImage(src);
  const [x, y, w, h] = bbox;
  const sx = Math.max(0, Math.round(x * image.naturalWidth));
  const sy = Math.max(0, Math.round(y * image.naturalHeight));
  const sw = Math.max(4, Math.round(w * image.naturalWidth));
  const sh = Math.max(4, Math.round(h * image.naturalHeight));
  const scale = Math.min(1, maxWidth / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fffdf8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas, 'image/jpeg', quality);
}

/**
 * 按像素矩形裁剪，供交互式裁剪器使用。rect 基于图片自然尺寸。
 */
export async function cropImageRect(src, rect, { quality = 0.92, maxWidth = 1800, rotation = 0 } = {}) {
  const image = await loadImage(src);
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  let sx = Math.max(0, Math.round(rect.x));
  let sy = Math.max(0, Math.round(rect.y));
  let sw = Math.max(2, Math.round(rect.width));
  let sh = Math.max(2, Math.round(rect.height));
  if (sx + sw > sourceWidth) sw = sourceWidth - sx;
  if (sy + sh > sourceHeight) sh = sourceHeight - sy;
  const scale = Math.min(1, maxWidth / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fffdf8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (rotation) {
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(image, sx, sy, sw, sh, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
    ctx.restore();
  } else {
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  }
  return canvasToBlob(canvas, 'image/jpeg', quality);
}

export async function blobToFile(blob, name = 'crop.jpg') {
  return new File([blob], name, { type: blob.type || 'image/jpeg' });
}
