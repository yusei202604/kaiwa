import { SESSION_VERSION } from './constants.js';

const SIGNAL_CANDIDATE_LIMIT = 2;
const DESCRIPTION_TYPE_ENCODE = {
  offer: 'o',
  answer: 'a'
};
const DESCRIPTION_TYPE_DECODE = {
  offer: 'offer',
  answer: 'answer',
  o: 'offer',
  a: 'answer'
};
const FIXED_SDP_LINES = {
  sessionVersion: 'v=0',
  sessionName: 's=-',
  sessionTiming: 't=0 0',
  bundleGroup: 'a=group:BUNDLE 0',
  streamSemantic: 'a=msid-semantic: WMS',
  connection: 'c=IN IP4 0.0.0.0',
  mediaId: 'a=mid:0',
  direction: 'a=sendrecv',
  iceOptions: 'a=ice-options:trickle',
  sctpPort: 'a=sctp-port:5000',
  maxMessageSize: 'a=max-message-size:262144',
  endOfCandidates: 'a=end-of-candidates'
};

function uniqCandidates(candidates) {
  const seen = new Set();
  const priority = ['srflx', 'host', 'relay'];

  return candidates
    .sort((a, b) => priority.indexOf(a.kind) - priority.indexOf(b.kind))
    .filter((candidate) => {
      const key = `${candidate.kind}:${candidate.value}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, SIGNAL_CANDIDATE_LIMIT);
}

function classifyCandidate(line) {
  if (line.includes(' typ srflx ')) {
    return 'srflx';
  }
  if (line.includes(' typ relay ')) {
    return 'relay';
  }
  return 'host';
}

export function slimDescription(description) {
  const lines = description.sdp
    .split('\r\n')
    .filter(Boolean);

  const kept = [];
  const candidates = [];

  for (const line of lines) {
    if (line.startsWith('a=candidate:')) {
      candidates.push({ kind: classifyCandidate(line), value: line });
      continue;
    }

    if (
      line.startsWith('v=') ||
      line.startsWith('o=') ||
      line.startsWith('s=') ||
      line.startsWith('t=') ||
      line.startsWith('m=') ||
      line.startsWith('c=') ||
      line.startsWith('a=group:') ||
      line.startsWith('a=mid:') ||
      line.startsWith('a=msid-semantic:') ||
      line.startsWith('a=sendrecv') ||
      line.startsWith('a=ice-ufrag:') ||
      line.startsWith('a=ice-pwd:') ||
      line.startsWith('a=ice-options:') ||
      line.startsWith('a=fingerprint:') ||
      line.startsWith('a=setup:') ||
      line.startsWith('a=sctp-port:') ||
      line.startsWith('a=max-message-size:') ||
      line.startsWith('a=end-of-candidates')
    ) {
      kept.push(line);
    }
  }

  uniqCandidates(candidates).forEach((candidate) => kept.push(candidate.value));
  kept.push('a=end-of-candidates');

  return {
    type: description.type,
    sdp: `${kept.join('\r\n')}\r\n`
  };
}

export function encodeSessionPayload(role, description) {
  const slim = slimDescription(description);
  const payload = {
    v: SESSION_VERSION,
    d: packDescription(role || slim.type, slim)
  };

  return toBase64Url(JSON.stringify(payload));
}

export function decodeSessionPayload(code) {
  const rawCode = code.trim();
  let payload;

  try {
    payload = JSON.parse(fromBase64Url(rawCode));
  } catch (error) {
    throw normalizeDecodeError(error, rawCode);
  }

  const version = payload.v ?? payload.version;
  if (version !== SESSION_VERSION) {
    throw new Error('未対応の接続情報です');
  }

  const description = normalizeDescription(payload.d ?? payload.description);
  const role = normalizeDescriptionType(payload.r ?? payload.role ?? description.type);

  return {
    version,
    role,
    description
  };
}

function toBase64Url(value) {
  return btoa(unescape(encodeURIComponent(value)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  return decodeURIComponent(escape(atob(padded)));
}

function encodeDescriptionType(type) {
  const encoded = DESCRIPTION_TYPE_ENCODE[type];
  if (!encoded) {
    throw new Error('未対応の接続情報です');
  }
  return encoded;
}

function normalizeDescriptionType(type) {
  const normalized = DESCRIPTION_TYPE_DECODE[type];
  if (!normalized) {
    throw new Error('接続情報の形式が不正です');
  }
  return normalized;
}

function normalizeDescription(description) {
  if (!description || typeof description !== 'object') {
    throw new Error('接続情報の形式が不正です');
  }

  if (typeof description.s === 'string' || typeof description.sdp === 'string') {
    const type = normalizeDescriptionType(description.t ?? description.type);
    const sdp = description.s ?? description.sdp;

    if (typeof sdp !== 'string' || !sdp.trim()) {
      throw new Error('接続情報の形式が不正です');
    }

    return { type, sdp };
  }

  return unpackDescription(description);
}

function normalizeDecodeError(error, rawCode) {
  const message = error instanceof Error ? error.message : '';
  const looksLikeBase64Url = /^[A-Za-z0-9\-_]+$/.test(rawCode);

  if (
    message.includes('atob') ||
    message.includes('Latin1') ||
    message.includes('Invalid character') ||
    message.includes('URI malformed')
  ) {
    return new Error(
      looksLikeBase64Url
        ? '共有コードが途中で切れているか壊れています'
        : '共有コードの形式が不正です'
    );
  }

  if (message.includes('JSON') || message.includes('correctly encoded')) {
    return new Error('共有コードが途中で切れているか壊れています');
  }

  return new Error('接続情報の形式が不正です');
}

function packDescription(type, description) {
  const lines = description.sdp.split('\r\n').filter(Boolean);
  const packed = {
    t: encodeDescriptionType(type),
    c: []
  };

  for (const line of lines) {
    if (line.startsWith('o=')) {
      packed.o = line.slice(2);
    } else if (line.startsWith('m=')) {
      packed.m = line.slice(2);
    } else if (line.startsWith('a=ice-ufrag:')) {
      packed.u = line.slice(12);
    } else if (line.startsWith('a=ice-pwd:')) {
      packed.p = line.slice(10);
    } else if (line.startsWith('a=fingerprint:')) {
      packed.f = line.slice(14);
    } else if (line.startsWith('a=setup:')) {
      packed.e = line.slice(8);
    } else if (
      line.startsWith('a=max-message-size:') &&
      line !== FIXED_SDP_LINES.maxMessageSize
    ) {
      packed.z = line.slice(19);
    } else if (
      line.startsWith('a=ice-options:') &&
      line !== FIXED_SDP_LINES.iceOptions
    ) {
      packed.i = line.slice(14);
    } else if (line.startsWith('a=candidate:')) {
      packed.c.push(line.slice(12));
    }
  }

  if (
    !packed.o ||
    !packed.m ||
    !packed.u ||
    !packed.p ||
    !packed.f ||
    !packed.e ||
    !Array.isArray(packed.c)
  ) {
    throw new Error('接続情報の形式が不正です');
  }

  return packed;
}

function unpackDescription(description) {
  const type = normalizeDescriptionType(description.t);
  const candidates = Array.isArray(description.c) ? description.c : null;

  if (
    !description.o ||
    !description.m ||
    !description.u ||
    !description.p ||
    !description.f ||
    !description.e ||
    !candidates ||
    candidates.some((candidate) => typeof candidate !== 'string' || !candidate.trim())
  ) {
    throw new Error('接続情報の形式が不正です');
  }

  const lines = [
    FIXED_SDP_LINES.sessionVersion,
    `o=${description.o}`,
    FIXED_SDP_LINES.sessionName,
    FIXED_SDP_LINES.sessionTiming,
    FIXED_SDP_LINES.bundleGroup,
    FIXED_SDP_LINES.streamSemantic,
    `m=${description.m}`,
    FIXED_SDP_LINES.connection,
    FIXED_SDP_LINES.mediaId,
    FIXED_SDP_LINES.direction,
    `a=ice-ufrag:${description.u}`,
    `a=ice-pwd:${description.p}`,
    description.i ? `a=ice-options:${description.i}` : FIXED_SDP_LINES.iceOptions,
    `a=fingerprint:${description.f}`,
    `a=setup:${description.e}`,
    FIXED_SDP_LINES.sctpPort,
    description.z ? `a=max-message-size:${description.z}` : FIXED_SDP_LINES.maxMessageSize,
    ...candidates.map((candidate) => `a=candidate:${candidate}`),
    FIXED_SDP_LINES.endOfCandidates
  ];

  return {
    type,
    sdp: `${lines.join('\r\n')}\r\n`
  };
}
