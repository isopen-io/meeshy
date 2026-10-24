/**
 * #11257 — les scripts de charge du chantier média (k6) se JOUENT ici, sur un
 * faux k6 : le témoin n'interroge pas leur texte mais ce qu'ils envoient. Un
 * chargeur de modules Node remplace `k6` et `k6/http` par des doubles qui
 * enregistrent chaque requête ; le script réel s'exécute (init, `setup`, une
 * itération), et le témoin lit la charge qu'il aurait poussée au serveur.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = resolve(__dirname, '../../../../../..');
const UPLOAD_SCRIPT = 'tests/load/media-upload.js';
const VOICE_SCRIPT = 'tests/load/vocal-30s.js';
const TARGET_MODULE = 'tests/load/target.js';
const STAGING = 'https://gate.staging.meeshy.me';
const CONVERSATION_ID = '64b7f0c2a1b2c3d4e5f60718';

type RecordedFile = {
  readonly filename: string;
  readonly contentType: string;
  readonly byteLength: number;
  readonly headBase64: string;
};

type RecordedCall = {
  readonly url: string;
  readonly authorization: string | null;
  readonly tags: Readonly<Record<string, string>>;
  readonly files: readonly RecordedFile[];
  readonly json: unknown;
};

type RunResult = {
  readonly error: string | null;
  readonly calls: readonly RecordedCall[];
  readonly checks: Readonly<Record<string, boolean>>;
};

const HOOKS = `
const STUBS = {
  'k6': new URL('./k6.mjs', import.meta.url).href,
  'k6/http': new URL('./k6-http.mjs', import.meta.url).href,
};
export async function resolve(specifier, context, next) {
  if (STUBS[specifier]) return { url: STUBS[specifier], shortCircuit: true };
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.includes('/tests/load/') && url.endsWith('.js')) {
    return next(url, { ...context, format: 'module' });
  }
  return next(url, context);
}
`;

const REGISTER = `
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
`;

const K6 = `
export function check(response, assertions) {
  return Object.entries(assertions).every(([name, assertion]) => {
    const passed = Boolean(assertion(response));
    globalThis.__k6.checks[name] = passed;
    return passed;
  });
}
`;

const K6_HTTP = `
const toBytes = (data) => {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return new TextEncoder().encode(String(data));
};
const responseFor = (url) => {
  if (url.endsWith('/api/v1/auth/login')) return { status: 200, body: { success: true, data: { token: 'login-token' } } };
  if (url.endsWith('/api/v1/attachments/upload')) {
    const attachments = process.env.K6_STUB_UPLOAD_EMPTY === '1' ? [] : [{ id: 'uploaded-attachment' }];
    return { status: 200, body: { success: true, data: { attachments } } };
  }
  return { status: 201, body: { success: true, data: { id: 'sent-message' } } };
};
const pick = (value, path) => path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), value);
export default {
  file(data, filename, contentType) {
    return { __file: true, bytes: toBytes(data), filename, contentType };
  },
  post(url, body, params = {}) {
    const files = body && typeof body === 'object'
      ? Object.values(body).filter((value) => value && value.__file).map((file) => ({
          filename: file.filename,
          contentType: file.contentType,
          byteLength: file.bytes.byteLength,
          headBase64: Buffer.from(file.bytes.subarray(0, 44)).toString('base64'),
        }))
      : [];
    const headers = params.headers || {};
    globalThis.__k6.calls.push({
      url,
      authorization: headers.Authorization || null,
      tags: params.tags || {},
      files,
      json: typeof body === 'string' ? JSON.parse(body) : null,
    });
    const { status, body: responseBody } = responseFor(url);
    return { status, json: (path) => (path ? pick(responseBody, path) : responseBody) };
  },
};
`;

const RUNNER = `
import { pathToFileURL } from 'node:url';
globalThis.__ENV = JSON.parse(process.env.K6_TEST_ENV);
globalThis.__k6 = { calls: [], checks: {} };
let error = null;
try {
  const script = await import(pathToFileURL(process.argv[2]).href);
  const data = script.setup ? script.setup() : undefined;
  script.default(data);
} catch (caught) {
  error = caught instanceof Error ? caught.message : String(caught);
}
process.stdout.write(JSON.stringify({ error, calls: globalThis.__k6.calls, checks: globalThis.__k6.checks }));
`;

const HARNESS_DIR = (() => {
  const dir = mkdtempSync(join(tmpdir(), 'k6-harness-'));
  writeFileSync(join(dir, 'hooks.mjs'), HOOKS);
  writeFileSync(join(dir, 'register.mjs'), REGISTER);
  writeFileSync(join(dir, 'k6.mjs'), K6);
  writeFileSync(join(dir, 'k6-http.mjs'), K6_HTTP);
  writeFileSync(join(dir, 'runner.mjs'), RUNNER);
  return dir;
})();

const runScript = (
  relativePath: string,
  env: Readonly<Record<string, string>>,
  stub: Readonly<Record<string, string>> = {},
): RunResult => {
  const result = spawnSync(
    process.execPath,
    ['--no-warnings', '--import', join(HARNESS_DIR, 'register.mjs'), join(HARNESS_DIR, 'runner.mjs'), resolve(REPO_ROOT, relativePath)],
    { cwd: REPO_ROOT, encoding: 'utf8', env: { ...process.env, ...stub, K6_TEST_ENV: JSON.stringify(env) } },
  );
  if (result.status !== 0) throw new Error(`harnais k6 en échec (${result.status}) : ${result.stderr}`);
  return JSON.parse(result.stdout) as RunResult;
};

const wavHeader = (file: RecordedFile) => {
  const head = Buffer.from(file.headBase64, 'base64');
  const channels = head.readUInt16LE(22);
  const sampleRate = head.readUInt32LE(24);
  const bitsPerSample = head.readUInt16LE(34);
  const dataBytes = head.readUInt32LE(40);
  return {
    riff: head.toString('latin1', 0, 4),
    wave: head.toString('latin1', 8, 12),
    channels,
    sampleRate,
    dataBytes,
    seconds: dataBytes / (sampleRate * channels * (bitsPerSample / 8)),
  };
};

const isIgnoredByGit = (relativePath: string): boolean =>
  spawnSync('git', ['check-ignore', '-q', relativePath], { cwd: REPO_ROOT }).status === 0;

describe('scripts de charge k6 (#11257)', () => {
  it('sont suivis par git, et non ignorés par tests/.gitignore', () => {
    expect([UPLOAD_SCRIPT, VOICE_SCRIPT, TARGET_MODULE].filter(isIgnoredByGit)).toEqual([]);
  });

  it('media-upload pousse UN fichier de 5 Mo sur la route d’upload des pièces jointes, authentifié', () => {
    const run = runScript(UPLOAD_SCRIPT, { K6_BASE_URL: STAGING, K6_TOKEN: 'given-token' });

    expect(run.error).toBeNull();
    expect(run.calls.map((call) => call.url)).toEqual([`${STAGING}/api/v1/attachments/upload`]);
    const [upload] = run.calls;
    expect(upload.authorization).toBe('Bearer given-token');
    expect(upload.files).toHaveLength(1);
    expect(upload.files[0].byteLength).toBe(5 * 1024 * 1024);
    expect(upload.files[0].contentType).toBe('application/pdf');
    expect(Buffer.from(upload.files[0].headBase64, 'base64').toString('latin1', 0, 5)).toBe('%PDF-');
    expect(Object.values(run.checks).every(Boolean)).toBe(true);
  });

  it('media-upload obtient son jeton par la connexion quand aucun jeton n’est fourni', () => {
    const run = runScript(UPLOAD_SCRIPT, { K6_BASE_URL: STAGING, K6_USERNAME: 'load', K6_PASSWORD: 'secret' });

    expect(run.calls.map((call) => call.url)).toEqual([`${STAGING}/api/v1/auth/login`, `${STAGING}/api/v1/attachments/upload`]);
    expect(run.calls[0].json).toEqual({ username: 'load', password: 'secret' });
    expect(run.calls[1].authorization).toBe('Bearer login-token');
  });

  it('vocal-30s téléverse un WAV de 30 secondes, puis envoie le message qui porte CETTE pièce jointe', () => {
    const run = runScript(VOICE_SCRIPT, { K6_BASE_URL: STAGING, K6_TOKEN: 'given-token', K6_CONVERSATION_ID: CONVERSATION_ID });

    expect(run.error).toBeNull();
    expect(run.calls.map((call) => call.url)).toEqual([
      `${STAGING}/api/v1/attachments/upload`,
      `${STAGING}/api/v1/conversations/${CONVERSATION_ID}/messages`,
    ]);
    const [upload, send] = run.calls;
    const [voice] = upload.files;
    const header = wavHeader(voice);
    expect(voice.contentType).toBe('audio/wav');
    expect(header).toMatchObject({ riff: 'RIFF', wave: 'WAVE', channels: 1, sampleRate: 16000, seconds: 30 });
    expect(voice.byteLength).toBe(44 + header.dataBytes);
    expect(send.json).toEqual({ attachmentIds: ['uploaded-attachment'] });
    expect(send.authorization).toBe('Bearer given-token');
    expect(Object.values(run.checks).every(Boolean)).toBe(true);
  });

  it('vocal-30s n’envoie aucun message quand l’upload ne rend pas de pièce jointe', () => {
    const run = runScript(
      VOICE_SCRIPT,
      { K6_BASE_URL: STAGING, K6_TOKEN: 'given-token', K6_CONVERSATION_ID: CONVERSATION_ID },
      { K6_STUB_UPLOAD_EMPTY: '1' },
    );

    expect(run.calls.map((call) => call.url)).toEqual([`${STAGING}/api/v1/attachments/upload`]);
  });

  it('vocal-30s refuse de partir sans conversation cible', () => {
    const run = runScript(VOICE_SCRIPT, { K6_BASE_URL: STAGING, K6_TOKEN: 'given-token' });

    expect(run.error).toMatch(/K6_CONVERSATION_ID/);
    expect(run.calls).toEqual([]);
  });

  it.each([
    [UPLOAD_SCRIPT, 'https://gate.meeshy.me'],
    [UPLOAD_SCRIPT, 'https://meeshy.me/'],
    [VOICE_SCRIPT, 'https://GATE.MEESHY.ME.'],
    [VOICE_SCRIPT, 'https://gate.meeshy.me:443/'],
  ])('%s refuse la production (%s) avant toute requête', (script, baseUrl) => {
    const run = runScript(script, { K6_BASE_URL: baseUrl, K6_TOKEN: 'given-token', K6_CONVERSATION_ID: CONVERSATION_ID });

    expect(run.error).toMatch(/production/);
    expect(run.calls).toEqual([]);
  });
});
