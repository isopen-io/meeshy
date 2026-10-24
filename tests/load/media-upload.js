// #11257 — charge de l'upload d'une pièce jointe de 5 Mo (k6).
// Mesure le temps de `POST /api/v1/attachments/upload`, sans rien pousser hors du serveur.
// Entrées (environnement) : K6_BASE_URL, et K6_TOKEN ou K6_USERNAME + K6_PASSWORD.
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.K6_BASE_URL || 'http://localhost:3000';
const UPLOAD_BYTES = 5 * 1024 * 1024;

export const options = {
  vus: Number(__ENV.K6_VUS || 5),
  duration: __ENV.K6_DURATION || '1m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
  },
};

function login() {
  if (__ENV.K6_TOKEN) return __ENV.K6_TOKEN;
  const response = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ username: __ENV.K6_USERNAME, password: __ENV.K6_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  return response.json('data.token');
}

// Un PDF factice de 5 Mo : en-tête valide, reste en zéros.
function fixturePdf() {
  const header = '%PDF-1.4\n';
  const body = new Uint8Array(UPLOAD_BYTES - header.length);
  const bytes = new Uint8Array(UPLOAD_BYTES);
  for (let i = 0; i < header.length; i += 1) bytes[i] = header.charCodeAt(i);
  bytes.set(body, header.length);
  return bytes.buffer;
}

const PDF = fixturePdf();

export function setup() {
  const token = login();
  if (!token) throw new Error('k6: aucun jeton (K6_TOKEN ou K6_USERNAME/K6_PASSWORD)');
  return { token };
}

export default function (data) {
  const response = http.post(
    `${BASE_URL}/api/v1/attachments/upload`,
    { files: http.file(PDF, 'upload-5mb.pdf', 'application/pdf') },
    { headers: { Authorization: `Bearer ${data.token}` }, tags: { stage: 'upload', kind: 'document' } },
  );
  check(response, {
    'upload 200': (r) => r.status === 200,
    'upload renvoie une pièce jointe': (r) => Array.isArray(r.json('data.attachments')),
  });
}
