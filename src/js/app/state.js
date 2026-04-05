const listeners = new Set();

export const sessionState = {
  status: 'idle',
  role: null,
  lastOfferCode: '',
  lastAnswerCode: '',
  lastOfferInputMethod: '',
  lastAnswerInputMethod: '',
  lastOfferScanSource: '',
  lastAnswerScanSource: ''
};

export function setSessionState(patch) {
  Object.assign(sessionState, patch);
  listeners.forEach((listener) => listener(sessionState));
}

export function onSessionState(listener) {
  listeners.add(listener);
  listener(sessionState);
  return () => listeners.delete(listener);
}
