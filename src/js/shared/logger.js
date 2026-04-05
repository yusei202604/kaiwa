import { dom } from '../app/dom.js';

export function log(message) {
  dom['log-box'].hidden = false;
  dom['log-box'].textContent += `${message}\n`;
  dom['log-box'].scrollTop = dom['log-box'].scrollHeight;
}

export function showError(message) {
  dom['error-box'].hidden = false;
  dom['error-box'].textContent = `エラー: ${message}`;
  log(`ERROR: ${message}`);
}

export function clearError() {
  dom['error-box'].hidden = true;
  dom['error-box'].textContent = '';
}

export function showDiagnostics(lines) {
  if (!lines.length) {
    dom['diag-box'].hidden = true;
    dom['diag-box'].textContent = '';
    return;
  }

  dom['diag-box'].hidden = false;
  dom['diag-box'].textContent = lines.join('\n');
}
