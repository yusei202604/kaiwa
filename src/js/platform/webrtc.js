import {
  ICE_CONFIG,
  ICE_PROGRESS_DELAY_MS,
  ICE_SLOW_WARNING_MS
} from '../shared/constants.js';
import { log } from '../shared/logger.js';

let peerConnection = null;

export function createPeerConnection() {
  closePeerConnection();
  peerConnection = new RTCPeerConnection(ICE_CONFIG);
  return peerConnection;
}

export function getPeerConnection() {
  return peerConnection;
}

export function closePeerConnection() {
  if (peerConnection) {
    log('RTCPeerConnection を閉じます');
    peerConnection.close();
    peerConnection = null;
  }
}

export function waitForIceComplete(
  pc,
  {
    onProgress,
    progressAfterMs = ICE_PROGRESS_DELAY_MS,
    slowAfterMs = ICE_SLOW_WARNING_MS
  } = {}
) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let progressTimer = null;
    let slowTimer = null;

    const cleanup = () => {
      pc.removeEventListener('icegatheringstatechange', onChange);
      if (progressTimer) {
        window.clearTimeout(progressTimer);
      }
      if (slowTimer) {
        window.clearTimeout(slowTimer);
      }
    };

    const finish = () => {
      cleanup();
      const elapsedMs = Date.now() - startedAt;
      log(`ICE gathering completed in ${formatElapsed(elapsedMs)}`);
      onProgress?.('complete', elapsedMs);
      resolve();
    };

    const onChange = () => {
      log(`ICE gathering state: ${pc.iceGatheringState}`);
      if (pc.iceGatheringState === 'complete') {
        finish();
      }
    };

    if (pc.iceGatheringState === 'complete') {
      finish();
      return;
    }

    if (progressAfterMs > 0) {
      progressTimer = window.setTimeout(() => {
        if (pc.iceGatheringState === 'complete') {
          return;
        }

        const elapsedMs = Date.now() - startedAt;
        log(`ICE gathering is still in progress after ${formatElapsed(elapsedMs)}`);
        onProgress?.('delayed', elapsedMs);
      }, progressAfterMs);
    }

    if (slowAfterMs > 0) {
      slowTimer = window.setTimeout(() => {
        if (pc.iceGatheringState === 'complete') {
          return;
        }

        const elapsedMs = Date.now() - startedAt;
        log(`ICE gathering is still in progress after ${formatElapsed(elapsedMs)} (slow path)`);
        onProgress?.('slow', elapsedMs);
      }, slowAfterMs);
    }

    pc.addEventListener('icegatheringstatechange', onChange);
    log(`ICE gathering state: ${pc.iceGatheringState}`);
  });
}

function formatElapsed(elapsedMs) {
  return `${(elapsedMs / 1000).toFixed(1)}s`;
}
