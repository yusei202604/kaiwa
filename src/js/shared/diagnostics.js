export function getEnvironmentDiagnostics() {
  const lines = [];

  if (!window.isSecureContext) {
    lines.push('このページは secure context ではありません。運用では固定の HTTPS URL を開いてください。ローカル検証で HTTPS を使う場合は、端末側で開発用証明書を信頼させる必要があります。');
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    lines.push('このブラウザではカメラ API が利用できません。共有コードの貼り付けを使用してください。');
  }

  if (location.protocol === 'https:' && location.hostname && /^[0-9.]+$/.test(location.hostname)) {
    lines.push(`現在のアクセス先は https://${location.hostname} です。これはローカル検証向けの開き方です。ブラウザに「接続は安全ではありません」が出る場合は、証明書の SAN とアクセス先が一致しているか、端末側で mkcert の CA を信頼しているかを確認してください。`);
  }

  return lines;
}

export function getPayloadDiagnostics(encoded, qrLimit) {
  if (!encoded) {
    return [];
  }

  if (encoded.length > qrLimit) {
    return [`共有コードが ${encoded.length} 文字あるため、QR では読みにくい可能性があります。共有ボタンまたはコピー貼り付けを使用してください。`];
  }

  return [];
}
