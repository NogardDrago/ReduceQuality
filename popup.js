// popup.js — Main entry point (ES module)
// Imports utility modules; accesses JSZip / pdfjsLib / PDFLib from globals (loaded via <script> tags).

import { processImage }                from './src/imageProcessor.js';
import { processPdf }                  from './src/pdfProcessor.js';
import { applyRename, splitFilename }  from './src/renamer.js';
import { createZip }                   from './src/zipper.js';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from './src/settings.js';

// ─── State ────────────────────────────────────────────────────────────────────
let settings = { ...DEFAULT_SETTINGS };

// image results: { id, file, state, originalName, origExt, origSize,
//                  blob, compressedSize, mimeType, ext, thumbUrl, error }
const imageResults = [];
const itemEls      = new Map(); // id -> DOM element

// pdf state
const pdfResults = [];
const pdfItemEls = new Map(); // id -> DOM element

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  settings = await loadSettings();
  applySettingsToUI();
  initTabs();
  initImageZone();
  initPdfZone();
  initSettingsForm();
});

// ─── Tabs ─────────────────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.tab;
      document.querySelectorAll('.tab').forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });
      document.querySelectorAll('.panel').forEach(p =>
        p.classList.toggle('active', p.id === `panel-${name}`)
      );
    });
  });
}

// ─── Image zone ───────────────────────────────────────────────────────────────
function initImageZone() {
  const drop  = document.getElementById('img-drop');
  const input = document.getElementById('img-input');

  // Browse button
  document.getElementById('img-browse-btn').addEventListener('click', e => {
    e.stopPropagation();
    input.click();
  });
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') input.click(); });
  input.addEventListener('change', () => addImageFiles(Array.from(input.files)));

  // Drag-and-drop
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag-over'); });
  drop.addEventListener('dragleave', e => { if (!drop.contains(e.relatedTarget)) drop.classList.remove('drag-over'); });
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files).filter(f => isImageFile(f));
    if (files.length) addImageFiles(files);
    else showToast('No valid image files found in drop.', 'error');
  });

  // Controls
  document.getElementById('btn-compress').addEventListener('click', compressAllImages);
  document.getElementById('btn-clear-img').addEventListener('click', clearImages);
  document.getElementById('btn-zip').addEventListener('click', downloadAllZip);
}

function isImageFile(f) {
  return ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(f.type);
}

function addImageFiles(files) {
  const valid = files.filter(f => {
    if (!isImageFile(f)) { showToast(`Skipped "${f.name}" — unsupported type.`, 'warning'); return false; }
    return true;
  });
  if (!valid.length) return;

  valid.forEach(file => {
    const { base, ext } = splitFilename(file.name);
    const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const thumbUrl = URL.createObjectURL(file);
    imageResults.push({ id, file, state: 'queued', originalName: base, origExt: ext,
      origSize: file.size, blob: null, compressedSize: null, mimeType: null,
      ext: null, thumbUrl, error: null });
    renderOrUpdateItem(imageResults.at(-1));
  });

  document.getElementById('img-drop').classList.add('hidden');
  showElement('img-controls');
  syncExportBar();
}

// ── Render file list ─────────────────────────────────────────────────────────
function renderOrUpdateItem(result) {
  if (itemEls.has(result.id)) {
    updateItemEl(itemEls.get(result.id), result);
  } else {
    const el = buildItemEl(result);
    itemEls.set(result.id, el);
    document.getElementById('img-list').appendChild(el);
  }
}

function buildItemEl(result) {
  const el = document.createElement('div');
  el.className = 'file-item';
  el.id = `item-${result.id}`;
  updateItemEl(el, result);
  return el;
}

function updateItemEl(el, result) {
  const displayName = result.ext ? `${result.originalName}.${result.origExt}` : result.originalName;
  const thumb = result.thumbUrl
    ? `<img class="file-thumb" src="${result.thumbUrl}" alt="" loading="lazy" />`
    : `<div class="file-thumb-placeholder"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>`;

  let sizeHtml = `<span>${formatBytes(result.origSize)}</span>`;
  if (result.state === 'done') {
    const saved = formatReduction(result.origSize, result.compressedSize);
    sizeHtml = `<span>${formatBytes(result.origSize)}</span><span class="arrow">→</span><span class="new-size">${formatBytes(result.compressedSize)}</span><span class="reduction">${saved}</span>`;
  }
  if (result.state === 'error') {
    sizeHtml = `<span style="color:var(--error);font-size:10.5px">${result.error}</span>`;
  }

  let statusHtml = '';
  if (result.state === 'queued')      statusHtml = `<span class="badge badge-queued">Queued</span>`;
  if (result.state === 'processing')  statusHtml = `<div class="spinner"></div>`;
  if (result.state === 'done') {
    statusHtml = `
      <button class="btn-icon" data-id="${result.id}" title="Download" aria-label="Download ${displayName}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </button>`;
  }
  if (result.state === 'error')       statusHtml = `<span class="badge badge-error">Error</span>`;

  el.innerHTML = `
    ${thumb}
    <div class="file-info">
      <div class="file-name" title="${displayName}">${displayName}</div>
      <div class="file-sizes">${sizeHtml}</div>
    </div>
    <div class="file-status">${statusHtml}</div>
  `;

  // Attach download handler
  const dlBtn = el.querySelector('.btn-icon[data-id]');
  if (dlBtn) {
    dlBtn.addEventListener('click', e => { e.stopPropagation(); downloadSingle(result.id); });
  }
}

// ── Compression ──────────────────────────────────────────────────────────────
async function compressAllImages() {
  const queued = imageResults.filter(r => r.state === 'queued');
  if (!queued.length) { showToast('Nothing to compress.', 'warning'); return; }

  document.getElementById('btn-compress').disabled = true;

  // Determine format from the per-tab selector (may override settings)
  const fmt = document.getElementById('img-format-select').value;
  const perBatchSettings = { ...settings, outputFormat: fmt };

  // Process sequentially to keep memory usage manageable
  let doneIdx = 0;
  for (const result of queued) {
    result.state = 'processing';
    renderOrUpdateItem(result);

    try {
      const out = await processImage(result.file, perBatchSettings);
      result.state          = 'done';
      result.blob           = out.blob;
      result.compressedSize = out.compressedSize;
      result.mimeType       = out.mimeType;
      result.ext            = out.ext;
      // Replace thumb with compressed version
      if (result.thumbUrl) URL.revokeObjectURL(result.thumbUrl);
      result.thumbUrl = URL.createObjectURL(out.blob);
      doneIdx++;
    } catch (err) {
      result.state = 'error';
      result.error = err.message || 'Compression failed';
    }

    renderOrUpdateItem(result);
  }

  document.getElementById('btn-compress').disabled = false;
  syncExportBar();

  const done = imageResults.filter(r => r.state === 'done').length;
  showToast(`${done} image${done !== 1 ? 's' : ''} compressed.`, 'success');
}

// ─ Sync export bar ────────────────────────────────────────────────────────────
function syncExportBar() {
  const done = imageResults.filter(r => r.state === 'done');
  if (!done.length) { hideElement('img-export'); return; }

  const totalOrig = done.reduce((s, r) => s + r.origSize,         0);
  const totalComp = done.reduce((s, r) => s + r.compressedSize,   0);
  const saved = formatReduction(totalOrig, totalComp);
  document.getElementById('img-summary').textContent =
    `${done.length} file${done.length !== 1 ? 's' : ''} · ${formatBytes(totalOrig)} → ${formatBytes(totalComp)} (${saved})`;

  showElement('img-export');
}

// ─ Downloads ─────────────────────────────────────────────────────────────────
function downloadSingle(id) {
  const result = imageResults.find(r => r.id === id);
  if (!result || !result.blob) return;

  const doneResults = imageResults.filter(r => r.state === 'done');
  const idx = doneResults.findIndex(r => r.id === id) + 1;
  const filename = applyRename(`${result.originalName}.${result.origExt}`, result.ext, idx, settings);
  triggerDownload(result.blob, filename);
}

async function downloadAllZip() {
  const done = imageResults.filter(r => r.state === 'done');
  if (!done.length) { showToast('No compressed images yet.', 'warning'); return; }

  const btn = document.getElementById('btn-zip');
  btn.disabled = true;
  btn.textContent = 'Zipping…';

  try {
    const files = done.map((r, idx) => ({
      filename: applyRename(`${r.originalName}.${r.origExt}`, r.ext, idx + 1, settings),
      blob: r.blob,
    }));
    const zipBlob = await createZip(files);
    triggerDownload(zipBlob, 'compressed-images.zip');
    showToast('ZIP downloaded!', 'success');
  } catch (err) {
    showToast('ZIP creation failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download ZIP`;
  }
}

function clearImages() {
  imageResults.forEach(r => { if (r.thumbUrl) URL.revokeObjectURL(r.thumbUrl); });
  imageResults.length = 0;
  itemEls.clear();
  document.getElementById('img-list').innerHTML = '';
  hideElement('img-controls');
  hideElement('img-export');
  showElement('img-drop', true); // show drop zone again
  document.getElementById('img-input').value = '';
  document.getElementById('img-drop').classList.remove('hidden');
}

// ─── PDF zone ─────────────────────────────────────────────────────────────────
function initPdfZone() {
  const drop  = document.getElementById('pdf-drop');
  const input = document.getElementById('pdf-input');

  document.getElementById('pdf-browse-btn').addEventListener('click', e => {
    e.stopPropagation();
    input.click();
  });
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') input.click(); });
  input.addEventListener('change', () => addPdfFiles(Array.from(input.files)));

  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag-over'); });
  drop.addEventListener('dragleave', e => { if (!drop.contains(e.relatedTarget)) drop.classList.remove('drag-over'); });
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
    if (files.length) addPdfFiles(files);
    else showToast('No valid PDF files found.', 'error');
  });

  document.getElementById('btn-compress-pdfs').addEventListener('click', compressAllPdfs);
  document.getElementById('btn-clear-pdf').addEventListener('click', clearPdfs);
  document.getElementById('btn-download-pdfs').addEventListener('click', downloadAllPdfsZip);
  document.getElementById('btn-extract-pdf-images').addEventListener('click', extractPdfImages);
}

function addPdfFiles(files) {
  const valid = files.filter(f => {
    if (f.type !== 'application/pdf') { showToast(`Skipped "${f.name}" — unsupported type.`, 'warning'); return false; }
    return true;
  });
  if (!valid.length) return;

  valid.forEach(file => {
    const { base, ext } = splitFilename(file.name);
    const id = `pdf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    pdfResults.push({ id, file, state: 'queued', originalName: base, origExt: ext,
      origSize: file.size, blob: null, compressedSize: null, jpegBlobs: null, error: null, progress: 0 });
    renderOrUpdatePdfItem(pdfResults.at(-1));
  });

  document.getElementById('pdf-drop').classList.add('hidden');
  showElement('pdf-controls');
  syncPdfExportBar();
}

function renderOrUpdatePdfItem(result) {
  if (pdfItemEls.has(result.id)) {
    updatePdfItemEl(pdfItemEls.get(result.id), result);
  } else {
    const el = document.createElement('div');
    el.className = 'file-item';
    el.id = `item-${result.id}`;
    updatePdfItemEl(el, result);
    pdfItemEls.set(result.id, el);
    document.getElementById('pdf-list').appendChild(el);
  }
}

function updatePdfItemEl(el, result) {
  const displayName = `${result.originalName}.${result.origExt}`;
  const iconHtml = `<div class="file-thumb-placeholder"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg></div>`;

  let sizeHtml = `<span>${formatBytes(result.origSize)}</span>`;
  if (result.state === 'done') {
    const saved = formatReduction(result.origSize, result.compressedSize);
    sizeHtml = `<span>${formatBytes(result.origSize)}</span><span class="arrow">→</span><span class="new-size">${formatBytes(result.compressedSize)}</span><span class="reduction">${saved}</span>`;
  }
  if (result.state === 'error') {
    sizeHtml = `<span style="color:var(--error);font-size:10.5px">${result.error}</span>`;
  }

  let statusHtml = '';
  if (result.state === 'queued') statusHtml = `<span class="badge badge-queued">Queued</span>`;
  if (result.state === 'processing') statusHtml = `<div class="spinner"></div> <span style="font-size:10px;margin-left:4px;">${result.progress}%</span>`;
  if (result.state === 'done') {
    statusHtml = `
      <button class="btn-icon" data-id="${result.id}" title="Download" aria-label="Download PDF">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </button>`;
  }
  if (result.state === 'error') statusHtml = `<span class="badge badge-error">Error</span>`;

  el.innerHTML = `
    ${iconHtml}
    <div class="file-info">
      <div class="file-name" title="${displayName}">${displayName}</div>
      <div class="file-sizes">${sizeHtml}</div>
    </div>
    <div class="file-status">${statusHtml}</div>
  `;

  const dlBtn = el.querySelector('.btn-icon[data-id]');
  if (dlBtn) {
    dlBtn.addEventListener('click', e => { e.stopPropagation(); downloadSinglePdf(result.id); });
  }
}

async function compressAllPdfs() {
  const queued = pdfResults.filter(r => r.state === 'queued');
  if (!queued.length) { showToast('Nothing to compress.', 'warning'); return; }

  document.getElementById('btn-compress-pdfs').disabled = true;

  let doneCount = 0;
  for (const result of queued) {
    result.state = 'processing';
    result.progress = 0;
    renderOrUpdatePdfItem(result);

    try {
      const out = await processPdf(result.file, settings, (cur, total) => {
        result.progress = Math.round((cur / total) * 100);
        renderOrUpdatePdfItem(result);
      });
      result.state          = 'done';
      result.blob           = out.blob;
      result.compressedSize = out.compressedSize;
      result.jpegBlobs      = out.jpegBlobs;
      doneCount++;
    } catch (err) {
      result.state = 'error';
      result.error = err.message || 'Processing failed';
    }

    renderOrUpdatePdfItem(result);
  }

  document.getElementById('btn-compress-pdfs').disabled = false;
  syncPdfExportBar();
  showToast(`${doneCount} PDF${doneCount !== 1 ? 's' : ''} compressed.`, 'success');
}

function syncPdfExportBar() {
  const done = pdfResults.filter(r => r.state === 'done');
  if (!done.length) { hideElement('pdf-export'); return; }

  const totalOrig = done.reduce((s, r) => s + r.origSize, 0);
  const totalComp = done.reduce((s, r) => s + r.compressedSize, 0);
  const saved = formatReduction(totalOrig, totalComp);
  document.getElementById('pdf-summary').textContent =
    `${done.length} PDF${done.length !== 1 ? 's' : ''} · ${formatBytes(totalOrig)} → ${formatBytes(totalComp)} (${saved})`;

  showElement('pdf-export');
}

function downloadSinglePdf(id) {
  const result = pdfResults.find(r => r.id === id);
  if (!result || !result.blob) return;
  const filename = `${result.originalName}-compressed.${result.origExt}`;
  triggerDownload(result.blob, filename);
}

async function downloadAllPdfsZip() {
  const done = pdfResults.filter(r => r.state === 'done');
  if (!done.length) return;

  const btn = document.getElementById('btn-download-pdfs');
  btn.disabled = true;

  try {
    const files = done.map(r => ({
      filename: `${r.originalName}-compressed.${r.origExt}`,
      blob: r.blob,
    }));
    const zipBlob = await createZip(files);
    triggerDownload(zipBlob, 'compressed-pdfs.zip');
    showToast('ZIP downloaded!', 'success');
  } catch (err) {
    showToast('ZIP creation failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function extractPdfImages() {
  const done = pdfResults.filter(r => r.state === 'done');
  if (!done.length) return;

  const mode = document.getElementById('pdf-extract-mode').value;
  const btn = document.getElementById('btn-extract-pdf-images');
  btn.disabled = true;
  btn.textContent = 'Zipping…';

  try {
    if (mode === 'separate') {
      for (const r of done) {
        if (!r.jpegBlobs || !r.jpegBlobs.length) continue;
        const files = r.jpegBlobs.map((blob, idx) => ({
          filename: `page-${String(idx + 1).padStart(3, '0')}.jpg`,
          blob: blob,
        }));
        const zipBlob = await createZip(files);
        triggerDownload(zipBlob, `${r.originalName}-images.zip`);
        await new Promise(resolve => setTimeout(resolve, 800));
      }
      showToast('Extraction complete!', 'success');
    } else {
      const allFiles = [];
      done.forEach(r => {
        if (!r.jpegBlobs || !r.jpegBlobs.length) return;
        r.jpegBlobs.forEach((blob, idx) => {
          let filename;
          if (mode === 'single-subfolder') {
            filename = `${r.originalName}/page-${String(idx + 1).padStart(3, '0')}.jpg`;
          } else {
            filename = `${r.originalName}-page-${String(idx + 1).padStart(3, '0')}.jpg`;
          }
          allFiles.push({ filename, blob });
        });
      });
      const zipBlob = await createZip(allFiles);
      triggerDownload(zipBlob, 'extracted-pdf-images.zip');
      showToast('Extraction ZIP downloaded!', 'success');
    }
  } catch (err) {
    showToast('Extraction failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Extract';
  }
}

function clearPdfs() {
  pdfResults.length = 0;
  pdfItemEls.clear();
  document.getElementById('pdf-list').innerHTML = '';
  hideElement('pdf-controls');
  hideElement('pdf-export');
  showElement('pdf-drop', true);
  document.getElementById('pdf-input').value = '';
  document.getElementById('pdf-drop').classList.remove('hidden');
}

// ─── Settings form ────────────────────────────────────────────────────────────
function initSettingsForm() {
  // Range inputs with live value display
  const rangeMaxDim = document.getElementById('set-maxdim');
  const rangeQuality = document.getElementById('set-quality');

  rangeMaxDim.addEventListener('input', () => {
    document.getElementById('set-maxdim-val').textContent = `${rangeMaxDim.value} px`;
  });
  rangeQuality.addEventListener('input', () => {
    document.getElementById('set-quality-val').textContent = `${rangeQuality.value}%`;
  });

  // Resize mode — show/hide sub-fields
  document.getElementById('set-resize-mode').addEventListener('change', syncResizeRows);

  // Rename mode — show/hide sub-fields
  document.getElementById('set-rename-mode').addEventListener('change', syncRenameRows);

  // Save
  document.getElementById('btn-save-settings').addEventListener('click', async () => {
    settings = readSettingsFromForm();
    await saveSettings(settings);
    showToast('Settings saved!', 'success');
  });
}

function applySettingsToUI() {
  document.getElementById('set-resize-mode').value = settings.resizeMode;
  document.getElementById('set-maxdim').value    = settings.maxDim;
  document.getElementById('set-maxdim-val').textContent = `${settings.maxDim} px`;
  document.getElementById('set-exact-w').value   = settings.exactWidth;
  document.getElementById('set-exact-h').value   = settings.exactHeight;
  document.getElementById('set-exact-fit').value = settings.exactFit;

  document.getElementById('set-quality').value   = Math.round(settings.quality * 100);
  document.getElementById('set-quality-val').textContent = `${Math.round(settings.quality * 100)}%`;

  document.getElementById('set-format').value       = settings.outputFormat;
  document.getElementById('img-format-select').value = settings.outputFormat;
  document.getElementById('set-rename-mode').value  = settings.renameMode;
  document.getElementById('set-prefix').value       = settings.prefix;
  document.getElementById('set-suffix').value       = settings.suffix;
  document.getElementById('set-seqprefix').value    = settings.seqPrefix;
  document.getElementById('set-separator').value    = settings.separator;
  document.getElementById('set-lowercase').checked  = settings.lowercase;
  syncRenameRows();
  syncResizeRows();
}

function syncResizeRows() {
  const mode = document.getElementById('set-resize-mode').value;
  document.getElementById('row-maxdim').classList.toggle('hidden', mode !== 'maxDim');
  document.getElementById('row-exactdim').classList.toggle('hidden', mode !== 'exact');
  document.getElementById('row-exactfit').classList.toggle('hidden', mode !== 'exact');
}

function syncRenameRows() {
  const mode = document.getElementById('set-rename-mode').value;
  document.getElementById('row-prefix').classList.toggle('hidden', mode !== 'prefix');
  document.getElementById('row-suffix').classList.toggle('hidden', mode !== 'suffix');
  document.getElementById('row-seqprefix').classList.toggle('hidden', mode !== 'sequential');
}

function readSettingsFromForm() {
  return {
    resizeMode:   document.getElementById('set-resize-mode').value,
    maxDim:       parseInt(document.getElementById('set-maxdim').value, 10),
    exactWidth:   parseInt(document.getElementById('set-exact-w').value, 10) || 1920,
    exactHeight:  parseInt(document.getElementById('set-exact-h').value, 10) || 1080,
    exactFit:     document.getElementById('set-exact-fit').value,
    quality:      parseInt(document.getElementById('set-quality').value, 10) / 100,
    outputFormat: document.getElementById('set-format').value,
    renameMode:   document.getElementById('set-rename-mode').value,
    prefix:       document.getElementById('set-prefix').value,
    suffix:       document.getElementById('set-suffix').value,
    separator:    document.getElementById('set-separator').value,
    lowercase:    document.getElementById('set-lowercase').checked,
    seqPrefix:    document.getElementById('set-seqprefix').value || 'image',
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatReduction(orig, compressed) {
  if (!orig || !compressed) return '—';
  const pct = ((orig - compressed) / orig * 100).toFixed(1);
  return `−${pct}%`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 320);
  }, 3200);
}

function showElement(id) {
  document.getElementById(id)?.classList.remove('hidden');
}

function hideElement(id) {
  document.getElementById(id)?.classList.add('hidden');
}
