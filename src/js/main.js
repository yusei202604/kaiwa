import { bind, dom } from './app/dom.js';
import {
  handleComposerCompositionEnd,
  handleComposerCompositionStart,
  handleComposerCompositionUpdate,
  handleComposerInput,
  isComposerComposing,
  sendMessage
} from './features/chat.js';
import {
  applyAnswerCode,
  applyOfferCode,
  beginAnswerScan,
  beginOfferScan,
  copyAnswer,
  copyOffer,
  shareAnswer,
  shareOffer,
  showAnswerPaste,
  showOfferPaste,
  startHostFlow,
  startJoinFlow,
  teardownSession
} from './features/session.js';

bind('action-start-host', 'click', startHostFlow);
bind('action-start-join', 'click', startJoinFlow);
bind('action-host-back', 'click', teardownSession);
bind('action-join-back', 'click', teardownSession);
bind('action-chat-back', 'click', teardownSession);
bind('action-scan-offer', 'click', beginOfferScan);
bind('action-paste-offer', 'click', showOfferPaste);
bind('action-apply-offer', 'click', () => applyOfferCode());
bind('action-scan-answer', 'click', beginAnswerScan);
bind('action-paste-answer', 'click', showAnswerPaste);
bind('action-apply-answer', 'click', () => applyAnswerCode());
bind('action-copy-offer', 'click', copyOffer);
bind('action-copy-answer', 'click', copyAnswer);
bind('action-share-offer', 'click', shareOffer);
bind('action-share-answer', 'click', shareAnswer);
bind('action-send-message', 'click', sendMessage);

dom['msg-input'].addEventListener('input', handleComposerInput);
dom['msg-input'].addEventListener('compositionstart', handleComposerCompositionStart);
dom['msg-input'].addEventListener('compositionupdate', handleComposerCompositionUpdate);
dom['msg-input'].addEventListener('compositionend', handleComposerCompositionEnd);
dom['msg-input'].addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !isComposerComposing()) {
    event.preventDefault();
    sendMessage();
  }
});
