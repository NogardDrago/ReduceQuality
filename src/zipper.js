// src/zipper.js — JSZip wrapper for creating ZIP archives

/**
 * Create a ZIP blob from an array of file descriptors.
 * @param {Array<{ filename: string, blob: Blob }>} files
 * @returns {Promise<Blob>}
 */
export async function createZip(files) {
  if (typeof JSZip === 'undefined') {
    throw new Error('JSZip library not loaded. Check that libs/jszip.min.js exists.');
  }

  const zip = new JSZip();

  for (const { filename, blob } of files) {
    zip.file(filename, blob);
  }

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}
