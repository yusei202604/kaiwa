import { log } from '../shared/logger.js';

let activeStream = null;
let scanTimer = null;
let detector = null;
let scanSession = 0;
let scanBusy = false;
let detectionLocked = false;

async function ensureDetector() {
  if ('BarcodeDetector' in window) {
    if (!detector) {
      detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    }
    return detector;
  }
  return null;
}

export async function startQrScanner(videoElement, onDetect) {
  if (!window.isSecureContext) {
    throw new Error('カメラは HTTPS の安全なコンテキストでのみ利用できます');
  }

  stopQrScanner(videoElement);
  scanSession += 1;
  const currentSession = scanSession;
  scanBusy = false;
  detectionLocked = false;

  activeStream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  });

  videoElement.hidden = false;
  videoElement.srcObject = activeStream;
  videoElement.setAttribute('playsinline', 'true');
  await videoElement.play();

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const barcodeDetector = await ensureDetector();
  const hasJsQr = typeof window.jsQR === 'function';
  if (!context) {
    throw new Error('QR 読み取りの準備に失敗しました');
  }
  if (!barcodeDetector && !hasJsQr) {
    throw new Error('このブラウザでは QR 読み取りが利用できません。共有コードの貼り付けを使用してください');
  }
  if (!barcodeDetector && hasJsQr) {
    log('BarcodeDetector が使えないため jsQR にフォールバックします');
  }

  log('QR スキャンを開始');
  scanTimer = window.setInterval(async () => {
    if (scanBusy || detectionLocked || currentSession !== scanSession) {
      return;
    }

    if (videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }

    scanBusy = true;

    try {
      const { width, height } = resolveFrameSize(videoElement.videoWidth, videoElement.videoHeight);
      canvas.width = width;
      canvas.height = height;
      context.drawImage(videoElement, 0, 0, width, height);

      const result = await detectQrData(barcodeDetector, context, canvas, width, height);

      if (result?.data && !detectionLocked && currentSession === scanSession) {
        detectionLocked = true;
        log(`QR を検出しました (${result.source})`);
        stopQrScanner(videoElement);
        await onDetect(result);
      }
    } catch (error) {
      log(`QR スキャンエラー: ${error.message}`);
    } finally {
      scanBusy = false;
    }
  }, 300);
}

export function stopQrScanner(videoElement) {
  scanSession += 1;
  scanBusy = false;
  detectionLocked = false;

  if (scanTimer) {
    window.clearInterval(scanTimer);
    scanTimer = null;
  }

  if (activeStream) {
    activeStream.getTracks().forEach((track) => track.stop());
    activeStream = null;
  }

  if (videoElement) {
    videoElement.pause();
    videoElement.srcObject = null;
    videoElement.hidden = true;
  }
}

function resolveFrameSize(width, height) {
  if (width <= 1280) {
    return { width, height };
  }

  return {
    width: Math.floor(width * 0.75),
    height: Math.floor(height * 0.75)
  };
}

async function detectQrData(barcodeDetector, context, canvas, width, height) {
  if (barcodeDetector) {
    try {
      const result = await barcodeDetector.detect(canvas);
      const data = result[0]?.rawValue ?? null;
      if (data) {
        return { data, source: 'BarcodeDetector' };
      }
    } catch (error) {
      log(`BarcodeDetector fallback: ${error.message}`);
    }
  }

  if (window.jsQR) {
    const image = context.getImageData(0, 0, width, height);
    const data = window.jsQR(image.data, image.width, image.height, {
      inversionAttempts: 'attemptBoth'
    })?.data ?? null;
    if (data) {
      return { data, source: 'jsQR' };
    }
  }

  return null;
}
