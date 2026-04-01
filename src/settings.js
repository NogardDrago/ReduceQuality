// src/settings.js — chrome.storage settings management

export const DEFAULT_SETTINGS = {
  maxDim: 1200,
  quality: 0.82,
  outputFormat: 'original',
  resizeMode: 'maxDim',
  exactWidth: 1920,
  exactHeight: 1080,
  exactFit: 'box',
  renameMode: 'original',
  prefix: '',
  suffix: '',
  separator: '-',
  lowercase: false,
  seqPrefix: 'image',
};

export function loadSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get('rq_settings', result => {
      resolve({ ...DEFAULT_SETTINGS, ...(result.rq_settings || {}) });
    });
  });
}

export function saveSettings(settings) {
  return new Promise(resolve => {
    chrome.storage.local.set({ rq_settings: settings }, resolve);
  });
}
