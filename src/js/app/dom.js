const ids = [
  'screen-start',
  'screen-host',
  'screen-join',
  'screen-chat',
  'error-box',
  'diag-box',
  'log-box',
  'host-status',
  'join-status',
  'host-offer-qr',
  'host-offer-qr-note',
  'host-offer-code',
  'host-answer-input',
  'host-answer-paste-actions',
  'video-host',
  'join-offer-input',
  'join-offer-paste-actions',
  'video-join',
  'answer-section',
  'join-answer-qr',
  'join-answer-qr-note',
  'join-answer-code',
  'messages',
  'msg-input',
  'action-send-message'
];

export const dom = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

export function bind(id, eventName, handler) {
  document.getElementById(id).addEventListener(eventName, handler);
}

export function showScreen(name) {
  ['start', 'host', 'join', 'chat'].forEach((screen) => {
    const visible = screen === name;
    document.getElementById(`screen-${screen}`).hidden = !visible;
  });
}

export function toggle(id, visible) {
  document.getElementById(id).hidden = !visible;
}
