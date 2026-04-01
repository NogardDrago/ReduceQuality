// src/pdfProcessor.js — PDF compression via pdf.js + pdf-lib
//
// Approach:
//   1. Each page is rendered to a <canvas> using pdf.js at a scale that caps
//      the longest edge at `maxDim` pixels.
//   2. The canvas is exported as a JPEG blob at the given quality.
//   3. pdf-lib assembles a brand-new PDF containing these JPEG images.
//
// Limitations:
//   - Text selectability is lost (pages are rasterized).
//   - Best results with scanned / image-based PDFs.
//   - Vector/text-heavy PDFs may not shrink much and will be rasterized.

let workerInitialized = false;

function ensureWorker() {
  if (workerInitialized) return;
  if (typeof pdfjsLib === 'undefined') {
    throw new Error('pdf.js not loaded. Check that libs/pdf.min.js exists.');
  }
  // Point the worker to our local copy so MV3 CSP is satisfied
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('libs/pdf.worker.min.js');
  workerInitialized = true;
}

/**
 * Compress a PDF file by rasterizing every page.
 *
 * @param {File} file
 * @param {object} settings - { maxDim: number, quality: number }
 * @param {function} onProgress - (currentPage: number, totalPages: number) => void
 * @returns {Promise<{ blob: Blob, originalSize: number, compressedSize: number }>}
 */
export async function processPdf(file, settings, onProgress) {
  ensureWorker();

  const { maxDim, quality } = settings;
  const srcBuffer = await file.arrayBuffer();

  // Load with pdf.js
  const loadTask = pdfjsLib.getDocument({ data: new Uint8Array(srcBuffer) });
  const pdfDoc   = await loadTask.promise;
  const numPages = pdfDoc.numPages;

  const jpegBlobs = [];
  const pageDims  = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);

    // Compute scale so that the longest rendered side == maxDim
    const base = page.getViewport({ scale: 1 });
    const scale = maxDim / Math.max(base.width, base.height);
    const vp = page.getViewport({ scale });

    const w = Math.round(vp.width);
    const h = Math.round(vp.height);

    // Use an off-DOM canvas (pdf.js needs a proper HTMLCanvasElement)
    const canvas = document.createElement('canvas');
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // White background (JPEG has no alpha channel)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    page.cleanup();

    // Export page as JPEG blob
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob) throw new Error(`Failed to render page ${pageNum}.`);

    jpegBlobs.push(blob);
    pageDims.push({ w, h });

    if (onProgress) onProgress(pageNum, numPages);
  }

  pdfDoc.destroy();

  // Rebuild PDF with pdf-lib
  if (typeof PDFLib === 'undefined') {
    throw new Error('pdf-lib not loaded. Check that libs/pdf-lib.min.js exists.');
  }
  const { PDFDocument } = PDFLib;
  const newDoc = await PDFDocument.create();

  for (let i = 0; i < jpegBlobs.length; i++) {
    const jpegBytes = new Uint8Array(await jpegBlobs[i].arrayBuffer());
    const img  = await newDoc.embedJpg(jpegBytes);
    const { w, h } = pageDims[i];
    const pg = newDoc.addPage([w, h]);
    pg.drawImage(img, { x: 0, y: 0, width: w, height: h });
  }

  const pdfBytes = await newDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });

  return {
    blob,
    originalSize: file.size,
    compressedSize: blob.size,
    jpegBlobs,
  };
}
