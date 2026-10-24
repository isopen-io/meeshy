// #11257 — charge d'un vocal de 30 s, de l'upload à l'envoi du message qui le porte (k6).
// Enchaîne `POST /api/v1/attachments/upload` puis `POST /api/v1/conversations/:id/messages`.
// L'envoi déclenche la chaîne audio du serveur (whisper → nllb → tts) : son temps se lit sur
// `audio_pipeline_seconds{stage}` (port interne du traducteur), jamais par ce script.
// Le WAV de synthèse est un silence : pour exercer la transcription et la traduction, passer
// un enregistrement parlé de 30 s par K6_VOICE_FILE. La production est refusée (target.js).
// Entrées (environnement) : K6_BASE_URL, K6_CONVERSATION_ID, K6_VOICE_FILE (facultatif),
// et K6_TOKEN ou K6_USERNAME + K6_PASSWORD.
import http from 'k6/http';
import { check } from 'k6';
import { bearerToken, targetBaseUrl } from './target.js';

const BASE_URL = targetBaseUrl(__ENV);
const CONVERSATION_ID = __ENV.K6_CONVERSATION_ID;
const VOICE_SECONDS = 30;
const SAMPLE_RATE = 16000;

export const options = {
  vus: Number(__ENV.K6_VUS || 3),
  duration: __ENV.K6_DURATION || '1m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{stage:upload}': ['p(95)<3000'],
    'http_req_duration{stage:send}': ['p(95)<1000'],
  },
};

// Un WAV PCM 16 bits mono de VOICE_SECONDS secondes, en-tête RIFF complet.
function fixtureWav() {
  const dataBytes = VOICE_SECONDS * SAMPLE_RATE * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeText = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, dataBytes, true);
  return buffer;
}

const VOICE = __ENV.K6_VOICE_FILE ? open(__ENV.K6_VOICE_FILE, 'b') : fixtureWav();

export function setup() {
  if (!CONVERSATION_ID) throw new Error('k6: K6_CONVERSATION_ID requis');
  return { token: bearerToken(BASE_URL, __ENV) };
}

export default function (data) {
  const headers = { Authorization: `Bearer ${data.token}` };
  const upload = http.post(
    `${BASE_URL}/api/v1/attachments/upload`,
    { files: http.file(VOICE, 'vocal-30s.wav', 'audio/wav') },
    { headers, tags: { stage: 'upload', kind: 'audio' } },
  );
  const attachmentId = upload.json('data.attachments.0.id');
  const uploaded = check(upload, {
    'upload vocal 200': (r) => r.status === 200,
    'upload vocal renvoie une pièce jointe': () => Boolean(attachmentId),
  });
  if (!uploaded) return;
  const send = http.post(
    `${BASE_URL}/api/v1/conversations/${CONVERSATION_ID}/messages`,
    JSON.stringify({ attachmentIds: [attachmentId] }),
    { headers: { ...headers, 'Content-Type': 'application/json' }, tags: { stage: 'send', kind: 'audio' } },
  );
  check(send, { 'envoi du vocal accepté': (r) => r.status === 200 || r.status === 201 });
}
