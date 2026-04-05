import { dom } from '../app/dom.js';
import { log } from '../shared/logger.js';

let dataChannel = null;
let onOpen = () => {};
let isComposing = false;
let peerTypingMessage = null;

export function setChatOpenHandler(handler) {
  onOpen = handler;
}

export function bindDataChannel(channel) {
  clearPeerTypingPreview();
  dataChannel = channel;
  updateComposerAvailability();

  channel.onopen = () => {
    log('DataChannel open');
    updateComposerAvailability();
    onOpen();
  };

  channel.onmessage = (event) => {
    let message;

    try {
      message = JSON.parse(event.data);
    } catch {
      log('DataChannel で不正な payload を受信しました');
      return;
    }

    if (message.type === 'typing') {
      updatePeerTypingPreview(message.text ?? '');
      return;
    }

    if (message.type === 'chat') {
      clearPeerTypingPreview();
      appendMessage(message.text, '相手', 'peer');
    }
  };

  channel.onclose = () => {
    clearPeerTypingPreview();
    if (dataChannel === channel) {
      dataChannel = null;
    }
    updateComposerAvailability();
  };
}

export function handleComposerInput() {
  syncTypingPreview();
  updateComposerAvailability();
}

export function handleComposerCompositionStart() {
  isComposing = true;
  syncTypingPreview();
  updateComposerAvailability();
}

export function handleComposerCompositionUpdate() {
  syncTypingPreview();
  updateComposerAvailability();
}

export function handleComposerCompositionEnd() {
  isComposing = false;
  syncTypingPreview();
  updateComposerAvailability();
}

export function isComposerComposing() {
  return isComposing;
}

export function sendMessage() {
  if (isComposing) {
    updateComposerAvailability();
    return;
  }

  const text = dom['msg-input'].value.trim();
  if (!text || !dataChannel || dataChannel.readyState !== 'open') {
    updateComposerAvailability();
    return;
  }

  dataChannel.send(JSON.stringify({
    type: 'chat',
    text,
    timestamp: Date.now()
  }));

  appendMessage(text, '自分', 'self');
  dom['msg-input'].value = '';
  sendTypingPreview('');
  updateComposerAvailability();
}

export function appendMessage(text, sender, side) {
  const item = createMessageElement({ text, sender, side });
  dom.messages.appendChild(item);
  dom.messages.scrollTop = dom.messages.scrollHeight;
}

export function resetMessages() {
  dom.messages.innerHTML = '';
  dom['msg-input'].value = '';
  peerTypingMessage = null;
  dataChannel = null;
  isComposing = false;
  updateComposerAvailability();
}

function syncTypingPreview() {
  sendTypingPreview(dom['msg-input'].value);
}

function sendTypingPreview(text) {
  if (!dataChannel || dataChannel.readyState !== 'open') {
    return;
  }

  dataChannel.send(JSON.stringify({
    type: 'typing',
    text,
    timestamp: Date.now()
  }));
}

function updatePeerTypingPreview(text) {
  if (!text) {
    clearPeerTypingPreview();
    return;
  }

  if (!peerTypingMessage) {
    peerTypingMessage = createMessageElement({
      text,
      sender: '相手が入力中',
      side: 'peer',
      typing: true
    });
    dom.messages.appendChild(peerTypingMessage);
  } else {
    peerTypingMessage.lastChild.textContent = text;
  }

  dom.messages.scrollTop = dom.messages.scrollHeight;
}

function clearPeerTypingPreview() {
  if (!peerTypingMessage) {
    return;
  }

  peerTypingMessage.remove();
  peerTypingMessage = null;
}

function createMessageElement({ text, sender, side, typing = false }) {
  const item = document.createElement('article');
  const label = document.createElement('strong');
  const body = document.createElement('span');

  item.className = `message ${side}${typing ? ' typing' : ''}`;
  if (typing) {
    item.setAttribute('aria-hidden', 'true');
  }

  label.textContent = sender;
  body.textContent = text;
  item.appendChild(label);
  item.appendChild(body);

  return item;
}

function updateComposerAvailability() {
  const button = dom['action-send-message'];
  if (!button) {
    return;
  }

  const hasText = Boolean(dom['msg-input'].value.trim());
  const isReady = dataChannel?.readyState === 'open';
  button.disabled = !hasText || !isReady || isComposing;
}
