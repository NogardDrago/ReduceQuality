// src/imageProcessor.js — Canvas-based image resize and compress

/**
 * Process a single image file: resize if needed, then re-encode at target quality.
 *
 * @param {File} file - The source image file
 * @param {object} settings - { maxDim: number, quality: number, outputFormat: string }
 * @returns {Promise<{
 *   blob: Blob,
 *   mimeType: string,
 *   ext: string,
 *   outWidth: number,
 *   outHeight: number,
 *   origWidth: number,
 *   origHeight: number,
 *   originalSize: number,
 *   compressedSize: number,
 *   originalName: string,
 * }>}
 */
export async function processImage(file, settings) {
  const { maxDim, quality, outputFormat } = settings;

  // Resolve output MIME type
  const mimeType = resolveOutputMime(file.type, outputFormat);
  const ext = mimeToExt(mimeType);

  // Decode the image
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`Cannot decode "${file.name}". File may be corrupt or unsupported.`);
  }

  const origWidth = bitmap.width;
  const origHeight = bitmap.height;

  // Compute output dimensions (only downscale, never upscale)
  const longest = Math.max(origWidth, origHeight);
  const scale = longest > maxDim ? maxDim / longest : 1;
  const outWidth  = Math.round(origWidth  * scale);
  const outHeight = Math.round(origHeight * scale);

  // Draw to OffscreenCanvas
  const canvas = new OffscreenCanvas(outWidth, outHeight);
  const ctx = canvas.getContext('2d');

  // Fill white background when converting transparent formats to JPEG
  if (mimeType === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outWidth, outHeight);
  }

  ctx.drawImage(bitmap, 0, 0, outWidth, outHeight);
  bitmap.close(); // free GPU memory

  // Encode
  const blob = await canvas.convertToBlob({ type: mimeType, quality });

  return {
    blob,
    mimeType,
    ext,
    outWidth,
    outHeight,
    origWidth,
    origHeight,
    originalSize: file.size,
    compressedSize: blob.size,
    originalName: file.name,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveOutputMime(sourceMime, outputFormat) {
  if (!outputFormat || outputFormat === 'original') {
    // Keep source MIME; fall back to jpeg for unknown types
    const supported = ['image/jpeg', 'image/png', 'image/webp'];
    return supported.includes(sourceMime) ? sourceMime : 'image/jpeg';
  }
  return outputFormat; // 'image/jpeg' or 'image/webp'
}

function mimeToExt(mime) {
  const map = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  return map[mime] || 'jpg';
}
