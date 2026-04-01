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
let pdfFile   = null;
let pdfResult = null; // { blob, originalSize, compressedSize }

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
  input.addEventListener('change', () => {
    if (input.files[0]) startPdfProcessing(input.files[0]);
  });

  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag-over'); });
  drop.addEventListener('dragleave', e => { if (!drop.contains(e.relatedTarget)) drop.classList.remove('drag-over'); });
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f && f.type === 'application/pdf') startPdfProcessing(f);
    else showToast('Please drop a PDF file.', 'error');
  });

  document.getElementById('btn-download-pdf').addEventListener('click', downloadPdf);
  document.getElementById('btn-extract-pdf-images').addEventListener('click', extractPdfImages);
  document.getElementById('btn-clear-pdf').addEventListener('click', clearPdf);
}

async function startPdfProcessing(file) {
  pdfFile   = file;
  pdfResult = null;

  document.getElementById('pdf-drop').classList.add('hidden');
  document.getElementById('pdf-filename').textContent = file.name;
  document.getElementById('pdf-progress-bar').style.width = '0%';
  document.getElementById('pdf-progress-label').textContent = 'Preparing…';
  document.getElementById('pdf-sizes').classList.add('hidden');
  document.getElementById('pdf-actions').classList.add('hidden');
  showElement('pdf-result', false);
  document.getElementById('pdf-result').classList.remove('hidden');

  try {
    const result = await processPdf(file, settings, (cur, total) => {
      const pct = Math.round((cur / total) * 100);
      document.getElementById('pdf-progress-bar').style.width = `${pct}%`;
      document.getElementById('pdf-progress-label').textContent = `Page ${cur} of ${total}`;
    });

    pdfResult = result;

    document.getElementById('pdf-progress-bar').style.width = '100%';
    document.getElementById('pdf-progress-label').textContent = 'Done!';
    document.getElementById('pdf-orig-size').textContent  = formatBytes(result.originalSize);
    document.getElementById('pdf-comp-size').textContent  = formatBytes(result.compressedSize);
    document.getElementById('pdf-reduction').textContent  = formatReduction(result.originalSize, result.compressedSize);
    document.getElementById('pdf-sizes').classList.remove('hidden');
    document.getElementById('pdf-actions').classList.remove('hidden');

    showToast('PDF compressed successfully!', 'success');
  } catch (err) {
    document.getElementById('pdf-progress-label').textContent = `Error: ${err.message}`;
    document.getElementById('pdf-progress-bar').style.background = 'var(--error)';
    showToast('PDF processing failed: ' + err.message, 'error');
  }
}

function downloadPdf() {
  if (!pdfResult) return;
  const name = pdfFile ? pdfFile.name.replace(/\.pdf$/i, '-compressed.pdf') : 'compressed.pdf';
  triggerDownload(pdfResult.blob, name);
}

async function extractPdfImages() {
  if (!pdfResult || !pdfResult.jpegBlobs || !pdfResult.jpegBlobs.length) return;
  
  const btn = document.getElementById('btn-extract-pdf-images');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'Zipping…';

  try {
    const baseName = pdfFile ? pdfFile.name.replace(/\.pdf$/i, '') : 'images';
    const files = pdfResult.jpegBlobs.map((blob, idx) => ({
      filename: `${baseName}-page-${String(idx + 1).padStart(3, '0')}.jpg`,
      blob: blob,
    }));
    
    const zipBlob = await createZip(files);
    triggerDownload(zipBlob, `${baseName}-images.zip`);
    showToast('Images extracted and zipped!', 'success');
  } catch (err) {
    showToast('ZIP extraction failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

function clearPdf() {
  pdfFile = pdfResult = null;
  document.getElementById('pdf-result').classList.add('hidden');
  document.getElementById('pdf-drop').classList.remove('hidden');
  document.getElementById('pdf-input').value = '';
  document.getElementById('pdf-progress-bar').style.background = '';
  
  const extractBtn = document.getElementById('btn-extract-pdf-images');
  if (extractBtn) {
    extractBtn.disabled = false;
    extractBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Extract Images to ZIP
    `;
  }
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
  document.getElementById('set-maxdim').value    = settings.maxDim;
  document.getElementById('set-maxdim-val').textContent = `${settings.maxDim} px`;

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
}

function syncRenameRows() {
  const mode = document.getElementById('set-rename-mode').value;
  document.getElementById('row-prefix').classList.toggle('hidden', mode !== 'prefix');
  document.getElementById('row-suffix').classList.toggle('hidden', mode !== 'suffix');
  document.getElementById('row-seqprefix').classList.toggle('hidden', mode !== 'sequential');
}

function readSettingsFromForm() {
  return {
    maxDim:       parseInt(document.getElementById('set-maxdim').value, 10),
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
