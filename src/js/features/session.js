import { dom, showScreen, toggle } from '../app/dom.js';
import { onSessionState, setSessionState, sessionState } from '../app/state.js';
import { bindDataChannel, resetMessages, setChatOpenHandler } from './chat.js';
import {
  copyToClipboard,
  presentAnswer,
  presentOffer,
  shareCode,
  toggleHostAnswerPaste,
  toggleJoinOfferPaste
} from './bootstrap.js';
import { startQrScanner, stopQrScanner } from '../platform/media.js';
import {
  closePeerConnection,
  createPeerConnection,
  getPeerConnection,
  waitForIceComplete
} from '../platform/webrtc.js';
import { decodeSessionPayload, encodeSessionPayload } from '../shared/codec.js';
import { getEnvironmentDiagnostics } from '../shared/diagnostics.js';
import { clearError, log, showDiagnostics, showError } from '../shared/logger.js';

const DEFAULT_HOST_STATUS = '接続情報を準備しています…';
const DEFAULT_JOIN_STATUS = '本人が表示した QR または共有コードを受け取ってください。';
const HOST_READY_STATUS = '会話相手に同じ URL を開いてもらい、QR または共有コードを渡してください。';
const JOIN_OFFER_ACTION_IDS = ['action-scan-offer', 'action-paste-offer', 'action-apply-offer'];
const HOST_ANSWER_ACTION_IDS = ['action-scan-answer', 'action-paste-answer', 'action-apply-answer'];
const HOST_OFFER_EXPORT_ACTION_IDS = ['action-copy-offer', 'action-share-offer'];
const JOIN_ANSWER_EXPORT_ACTION_IDS = ['action-copy-answer', 'action-share-answer'];

let isApplyingOffer = false;
let isApplyingAnswer = false;

function resetSessionObservability() {
  setSessionState({
    lastOfferInputMethod: '',
    lastAnswerInputMethod: '',
    lastOfferScanSource: '',
    lastAnswerScanSource: ''
  });
}

function resetUi() {
  isApplyingOffer = false;
  isApplyingAnswer = false;
  resetSessionObservability();
  dom['host-status'].textContent = DEFAULT_HOST_STATUS;
  dom['join-status'].textContent = DEFAULT_JOIN_STATUS;
  dom['host-offer-qr'].innerHTML = '';
  dom['join-answer-qr'].innerHTML = '';
  dom['host-offer-code'].value = '';
  dom['join-answer-code'].value = '';
  dom['host-offer-qr-note'].textContent = '';
  dom['join-answer-qr-note'].textContent = '';
  toggle('answer-section', false);
  toggleHostAnswerPaste(false);
  toggleJoinOfferPaste(false);
  setHostAnswerBusy(false);
  setJoinOfferBusy(false);
  setExportAvailability(HOST_OFFER_EXPORT_ACTION_IDS, false);
  setExportAvailability(JOIN_ANSWER_EXPORT_ACTION_IDS, false);
  stopQrScanner(dom['video-host']);
  stopQrScanner(dom['video-join']);
  resetMessages();
  clearError();
  showDiagnostics(getEnvironmentDiagnostics());
}

function setOfferInputMethod({ fromQr = false, scanSource = '' } = {}) {
  setSessionState({
    lastOfferInputMethod: fromQr ? 'qr' : 'paste',
    lastOfferScanSource: fromQr ? scanSource : ''
  });
}

function clearOfferInputMethod() {
  setSessionState({
    lastOfferInputMethod: '',
    lastOfferScanSource: ''
  });
}

function setAnswerInputMethod({ fromQr = false, scanSource = '' } = {}) {
  setSessionState({
    lastAnswerInputMethod: fromQr ? 'qr' : 'paste',
    lastAnswerScanSource: fromQr ? scanSource : ''
  });
}

function clearAnswerInputMethod() {
  setSessionState({
    lastAnswerInputMethod: '',
    lastAnswerScanSource: ''
  });
}

function formatInputMethod(method, scanSource) {
  if (method === 'qr') {
    return scanSource ? `QR (${scanSource})` : 'QR';
  }

  if (method === 'paste') {
    return '共有コード貼り付け';
  }

  return '';
}

function formatJoinCompletionStatus() {
  const inputMethod = formatInputMethod(sessionState.lastOfferInputMethod, sessionState.lastOfferScanSource);
  const suffix = inputMethod ? ` 受信方法: ${inputMethod}` : '';
  return `本人へ QR または共有コードを返してください。同じ URL の画面で操作できます。${suffix}`;
}

function formatHostApplyStatus() {
  const inputMethod = formatInputMethod(sessionState.lastAnswerInputMethod, sessionState.lastAnswerScanSource);
  const suffix = inputMethod ? ` 応答の受信方法: ${inputMethod}` : '';
  return `接続中です…${suffix}`;
}

function wirePeerConnection(pc) {
  pc.onconnectionstatechange = () => {
    log(`connectionState: ${pc.connectionState}`);
    if (pc.connectionState === 'connected') {
      setSessionState({ status: 'connected' });
    }
  };

  pc.ondatachannel = (event) => bindDataChannel(event.channel);
}

setChatOpenHandler(() => {
  setSessionState({ status: 'connected' });
});

onSessionState((state) => {
  if (state.status === 'hosting') {
    showScreen('host');
  } else if (state.status === 'joining' || state.status === 'showing-answer') {
    showScreen('join');
  } else if (state.status === 'connected') {
    showScreen('chat');
    focusElement(dom['msg-input']);
  } else {
    showScreen('start');
  }
});

export async function startHostFlow() {
  resetUi();
  setSessionState({
    status: 'hosting',
    role: 'host',
    lastOfferCode: '',
    lastAnswerCode: '',
    lastOfferInputMethod: '',
    lastAnswerInputMethod: '',
    lastOfferScanSource: '',
    lastAnswerScanSource: ''
  });
  const pc = createPeerConnection();
  wirePeerConnection(pc);

  const channel = pc.createDataChannel('chat');
  bindDataChannel(channel);

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    dom['host-status'].textContent = '通信候補を集めています…';
    await waitForIceComplete(pc, {
      onProgress(stage) {
        if (stage === 'delayed') {
          dom['host-status'].textContent = '通信候補を集めています… 少し時間がかかっています。';
        } else if (stage === 'slow') {
          dom['host-status'].textContent = '通信候補の収集中です。しばらく待つと接続情報が表示されます。';
        }
      }
    });
    const encoded = encodeSessionPayload('offer', pc.localDescription);
    setSessionState({ lastOfferCode: encoded });
    presentOffer(encoded);
    setExportAvailability(HOST_OFFER_EXPORT_ACTION_IDS, true);
    dom['host-status'].textContent = HOST_READY_STATUS;
  } catch (error) {
    dom['host-status'].textContent = DEFAULT_HOST_STATUS;
    showError(`接続情報の生成に失敗しました: ${error.message}`);
  }
}

export async function startJoinFlow() {
  resetUi();
  setSessionState({
    status: 'joining',
    role: 'join',
    lastOfferCode: '',
    lastAnswerCode: '',
    lastOfferInputMethod: '',
    lastAnswerInputMethod: '',
    lastOfferScanSource: '',
    lastAnswerScanSource: ''
  });
}

export async function beginOfferScan() {
  clearError();
  toggleJoinOfferPaste(false);
  dom['join-status'].textContent = 'QR を読み取っています…';

  try {
    await startQrScanner(dom['video-join'], async ({ data, source }) => {
      await applyOfferCode(data, { fromQr: true, scanSource: source });
    });
  } catch (error) {
    dom['join-status'].textContent = DEFAULT_JOIN_STATUS;
    showError(`QR 読み取りを開始できません: ${error.message}`);
  }
}

export async function beginAnswerScan() {
  clearError();
  toggleHostAnswerPaste(false);
  dom['host-status'].textContent = '相手の応答 QR を読み取っています…';

  try {
    await startQrScanner(dom['video-host'], async ({ data, source }) => {
      await applyAnswerCode(data, { fromQr: true, scanSource: source });
    });
  } catch (error) {
    dom['host-status'].textContent = HOST_READY_STATUS;
    showError(`QR 読み取りを開始できません: ${error.message}`);
  }
}

export async function applyOfferCode(
  rawCode = dom['join-offer-input'].value,
  { fromQr = false, scanSource = '' } = {}
) {
  if (isApplyingOffer) {
    log('Join 側の接続情報処理はすでに進行中です');
    return;
  }

  isApplyingOffer = true;
  setJoinOfferBusy(true);

  try {
    stopQrScanner(dom['video-join']);
    setOfferInputMethod({ fromQr, scanSource });
    dom['join-status'].textContent = fromQr
      ? 'QR を検出しました。接続情報を確認しています…'
      : '接続情報を確認しています…';
    const payload = decodeSessionPayload(rawCode);
    dom['join-status'].textContent = '応答コードを生成しています…';
    const pc = createPeerConnection();
    wirePeerConnection(pc);

    await pc.setRemoteDescription(payload.description);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    dom['join-status'].textContent = '通信候補を集めています… カメラ停止は正常です。';
    await waitForIceComplete(pc, {
      onProgress(stage) {
        if (stage === 'delayed') {
          dom['join-status'].textContent = '通信候補を集めています… 少し時間がかかっています。';
        } else if (stage === 'slow') {
          dom['join-status'].textContent = '通信候補の収集中です。しばらく待つと応答 QR が表示されます。';
        }
      }
    });

    const encoded = encodeSessionPayload('answer', pc.localDescription);
    setSessionState({ status: 'showing-answer', lastAnswerCode: encoded });
    presentAnswer(encoded);
    setExportAvailability(JOIN_ANSWER_EXPORT_ACTION_IDS, true);
    dom['join-status'].textContent = formatJoinCompletionStatus();
  } catch (error) {
    clearOfferInputMethod();
    dom['join-status'].textContent = DEFAULT_JOIN_STATUS;
    showError(`接続情報の読み込みに失敗しました: ${error.message}`);
  } finally {
    isApplyingOffer = false;
    setJoinOfferBusy(false);
  }
}

export async function applyAnswerCode(
  rawCode = dom['host-answer-input'].value,
  { fromQr = false, scanSource = '' } = {}
) {
  if (isApplyingAnswer) {
    log('Host 側の応答適用はすでに進行中です');
    return;
  }

  isApplyingAnswer = true;
  setHostAnswerBusy(true);

  try {
    stopQrScanner(dom['video-host']);
    setAnswerInputMethod({ fromQr, scanSource });
    dom['host-status'].textContent = fromQr
      ? 'QR を検出しました。応答を確認しています…'
      : '応答を確認しています…';
    const payload = decodeSessionPayload(rawCode);
    const pc = getPeerConnection();
    if (!pc) {
      throw new Error('先に本人側の接続情報を作成してください');
    }
    await pc.setRemoteDescription(payload.description);
    dom['host-status'].textContent = formatHostApplyStatus();
    setSessionState({ lastAnswerCode: rawCode.trim() });
  } catch (error) {
    clearAnswerInputMethod();
    dom['host-status'].textContent = HOST_READY_STATUS;
    showError(`応答の適用に失敗しました: ${error.message}`);
  } finally {
    isApplyingAnswer = false;
    setHostAnswerBusy(false);
  }
}

export async function copyOffer(statusMessage = '共有コードをコピーしました。') {
  if (!sessionState.lastOfferCode) {
    return;
  }

  try {
    await copyToClipboard(sessionState.lastOfferCode);
    dom['host-status'].textContent = statusMessage;
  } catch (error) {
    showError(`共有コードのコピーに失敗しました: ${error.message}`);
  }
}

export async function copyAnswer(statusMessage = '共有コードをコピーしました。') {
  if (!sessionState.lastAnswerCode) {
    return;
  }

  try {
    await copyToClipboard(sessionState.lastAnswerCode);
    dom['join-status'].textContent = statusMessage;
  } catch (error) {
    showError(`共有コードのコピーに失敗しました: ${error.message}`);
  }
}

export async function shareOffer() {
  if (!sessionState.lastOfferCode) {
    return;
  }

  try {
    const shared = await shareCode('かいわ 接続コード', sessionState.lastOfferCode);
    if (shared) {
      dom['host-status'].textContent = '共有シートを開きました。';
      return;
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      dom['host-status'].textContent = '共有をキャンセルしました。必要ならコピーを使ってください。';
      return;
    }

    log(`共有に失敗したためコピーへ切り替えます: ${error.message}`);
  }

  await copyOffer('共有が使えないため共有コードをコピーしました。');
}

export async function shareAnswer() {
  if (!sessionState.lastAnswerCode) {
    return;
  }

  try {
    const shared = await shareCode('かいわ 応答コード', sessionState.lastAnswerCode);
    if (shared) {
      dom['join-status'].textContent = '共有シートを開きました。';
      return;
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      dom['join-status'].textContent = '共有をキャンセルしました。必要ならコピーを使ってください。';
      return;
    }

    log(`共有に失敗したためコピーへ切り替えます: ${error.message}`);
  }

  await copyAnswer('共有が使えないため共有コードをコピーしました。');
}

export function showOfferPaste() {
  clearError();
  stopQrScanner(dom['video-join']);
  setOfferInputMethod();
  dom['join-status'].textContent = '共有コード入力へ切り替えました。共有コードを貼り付けて接続情報を読み込んでください。';
  toggleJoinOfferPaste(true);
  focusElement(dom['join-offer-input']);
}

export function showAnswerPaste() {
  clearError();
  stopQrScanner(dom['video-host']);
  setAnswerInputMethod();
  dom['host-status'].textContent = '共有コード入力へ切り替えました。相手から受け取った共有コードを貼り付けてください。';
  toggleHostAnswerPaste(true);
  focusElement(dom['host-answer-input']);
}

export function teardownSession() {
  resetUi();
  closePeerConnection();
  setSessionState({
    status: 'idle',
    role: null,
    lastOfferCode: '',
    lastAnswerCode: '',
    lastOfferInputMethod: '',
    lastAnswerInputMethod: '',
    lastOfferScanSource: '',
    lastAnswerScanSource: ''
  });
}

function setJoinOfferBusy(disabled) {
  setDisabled(JOIN_OFFER_ACTION_IDS, disabled);
  dom['join-offer-input'].disabled = disabled;
}

function setHostAnswerBusy(disabled) {
  setDisabled(HOST_ANSWER_ACTION_IDS, disabled);
  dom['host-answer-input'].disabled = disabled;
}

function setExportAvailability(ids, enabled) {
  setDisabled(ids, !enabled);
}

function setDisabled(ids, disabled) {
  ids.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.disabled = disabled;
    }
  });
}

function focusElement(element) {
  window.setTimeout(() => {
    element?.focus?.();
  }, 0);
}
