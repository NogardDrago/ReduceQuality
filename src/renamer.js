// src/renamer.js — filename rename convention logic

/**
 * Remove extension from a filename and return { base, ext }.
 * @param {string} filename
 */
export function splitFilename(filename) {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return { base: filename, ext: '' };
  return { base: filename.slice(0, lastDot), ext: filename.slice(lastDot + 1) };
}

/**
 * Apply rename convention to produce a new full filename.
 * @param {string} originalFilename - original filename including extension
 * @param {string} outputExt - the actual output extension (e.g. 'jpg', 'webp', 'png')
 * @param {number} index - 1-based sequential index (among all processed files)
 * @param {object} settings
 */
export function applyRename(originalFilename, outputExt, index, settings) {
  const { renameMode, prefix, suffix, separator, lowercase, seqPrefix } = settings;
  let { base } = splitFilename(originalFilename);

  // Replace spaces
  if (separator && separator !== 'none') {
    base = base.replace(/\s+/g, separator);
  }

  // Lowercase
  if (lowercase) {
    base = base.toLowerCase();
  }

  // Apply mode
  switch (renameMode) {
    case 'sequential':
      base = `${(seqPrefix || 'image').trim()}-${String(index).padStart(3, '0')}`;
      break;
    case 'prefix':
      base = `${prefix || ''}${base}`;
      break;
    case 'suffix':
      base = `${base}${suffix || ''}`;
      break;
    case 'original':
    default:
      break;
  }

  return `${sanitize(base)}.${outputExt.toLowerCase()}`;
}

/**
 * Remove filesystem-unsafe characters from a filename base.
 * @param {string} name
 */
export function sanitize(name) {
  return name.replace(/[/\\?%*:|"<>]/g, '_').replace(/\.{2,}/g, '.').trim() || 'file';
}
