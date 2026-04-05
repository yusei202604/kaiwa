import { dom, toggle } from '../app/dom.js';
import { QR_RENDER_LIMIT } from '../shared/constants.js';
import { getPayloadDiagnostics } from '../shared/diagnostics.js';
import { showDiagnostics } from '../shared/logger.js';

function renderQr(targetId, noteId, encoded) {
  const box = dom[targetId];
  const note = dom[noteId];
  box.innerHTML = '';

  const diagnostics = getPayloadDiagnostics(encoded, QR_RENDER_LIMIT);
  if (diagnostics.length) {
    note.textContent = diagnostics[0];
    showDiagnostics(diagnostics);
    return false;
  }

  note.textContent = 'QR を読み取れない場合は共有コードを使ってください。';
  new window.QRCode(box, {
    text: encoded,
    width: 320,
    height: 320,
    correctLevel: window.QRCode.CorrectLevel.M
  });
  return true;
}

export function presentOffer(encoded) {
  dom['host-offer-code'].value = encoded;
  renderQr('host-offer-qr', 'host-offer-qr-note', encoded);
}

export function presentAnswer(encoded) {
  toggle('answer-section', true);
  dom['join-answer-code'].value = encoded;
  renderQr('join-answer-qr', 'join-answer-qr-note', encoded);
}

export function toggleHostAnswerPaste(visible) {
  toggle('host-answer-input', visible);
  toggle('host-answer-paste-actions', visible);
  if (!visible) {
    dom['host-answer-input'].value = '';
  }
}

export function toggleJoinOfferPaste(visible) {
  toggle('join-offer-input', visible);
  toggle('join-offer-paste-actions', visible);
  if (!visible) {
    dom['join-offer-input'].value = '';
  }
}

export async function copyToClipboard(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const root = document.body ?? document.documentElement;
  if (!root || typeof document.execCommand !== 'function') {
    throw new Error('このブラウザではコピー機能を利用できません');
  }

  const helper = document.createElement('textarea');
  helper.value = value;
  helper.setAttribute('readonly', '');
  helper.style.position = 'fixed';
  helper.style.opacity = '0';
  helper.style.pointerEvents = 'none';
  helper.style.inset = '0';
  root.appendChild(helper);
  helper.select();
  helper.setSelectionRange?.(0, helper.value.length);

  const copied = document.execCommand('copy');
  helper.remove();

  if (!copied) {
    throw new Error('このブラウザではコピー機能を利用できません');
  }
}

export async function shareCode(title, text) {
  if (typeof navigator.share === 'function') {
    await navigator.share({ title, text });
    return true;
  }
  return false;
}
