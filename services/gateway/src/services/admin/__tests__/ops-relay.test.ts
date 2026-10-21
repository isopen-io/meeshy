/**
 * Le relais des opérations serveur (#10385, #10386) : la passerelle ne parle
 * jamais à Docker ni à systemd, elle DÉPOSE une demande validée dans un dossier
 * monté, et lit l'état que le runner de l'hôte publie.
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { opsRequestFileSchema } from '@meeshy/shared/types/admin-ops';
import {
  createOpsRelay,
  readDockerUsage,
  readOpsSettings,
  readOpsState,
} from '../ops-relay';

const NOW = new Date('2026-10-12T22:00:00.000Z');
const ID_A = '0b4f8a0e-6f43-4a4c-9a4b-2d2c7f7d1c11';
const ID_B = '1c5f8a0e-6f43-4a4c-9a4b-2d2c7f7d1c22';

const audited = async (): Promise<boolean> => true;

const roots: string[] = [];
afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

function dirs() {
  const root = mkdtempSync(path.join(tmpdir(), 'ops-relay-'));
  roots.push(root);
  const requests = path.join(root, 'requests');
  const state = path.join(root, 'state');
  mkdirSync(requests);
  mkdirSync(state);
  return { requests, state };
}

const env = (d: { requests: string; state: string }) => ({
  OPS_ENVIRONMENT: 'staging',
  OPS_SHARED_HOST: 'true',
  OPS_REQUESTS_DIR: d.requests,
  OPS_STATE_DIR: d.state,
});

const run = (overrides: Record<string, unknown> = {}) => ({
  requestId: ID_B,
  operation: 'backup',
  status: 'succeeded',
  requestedBy: 'jcnm',
  requestedAt: '2026-10-12T20:00:00.000Z',
  startedAt: '2026-10-12T20:00:01.000Z',
  finishedAt: '2026-10-12T20:03:00.000Z',
  reclaimedBytes: null,
  code: null,
  ...overrides,
});

function writeState(stateDir: string, state: unknown) {
  writeFileSync(path.join(stateDir, 'ops.json'), JSON.stringify(state));
}

const ids = (...list: string[]) => {
  const queue = [...list];
  return () => queue.shift() ?? ID_A;
};

describe('readOpsSettings', () => {
  it('lit l’environnement, l’hôte partagé et les dossiers, sans rien inventer', () => {
    expect(readOpsSettings({})).toEqual({
      environment: 'local',
      sharedHost: false,
      requestsDir: null,
      stateDir: null,
      diskProbePath: '/',
    });
    expect(
      readOpsSettings({
        OPS_ENVIRONMENT: 'staging',
        OPS_SHARED_HOST: 'true',
        OPS_REQUESTS_DIR: ' /ops-requests ',
        OPS_STATE_DIR: '/ops-state',
        HOST_DISK_PROBE_PATH: '/host',
      })
    ).toEqual({
      environment: 'staging',
      sharedHost: true,
      requestsDir: '/ops-requests',
      stateDir: '/ops-state',
      diskProbePath: '/host',
    });
    expect(readOpsSettings({ OPS_ENVIRONMENT: 'prod' }).environment).toBe('local');
  });
});

describe('lecture de l’état publié par le runner', () => {
  it('rend null pour un état absent, illisible, hors schéma ou trop gros', async () => {
    const d = dirs();
    expect(await readOpsState(d.state)).toBeNull();
    expect(await readOpsState(null)).toBeNull();
    writeFileSync(path.join(d.state, 'ops.json'), '{nope');
    expect(await readOpsState(d.state)).toBeNull();
    writeState(d.state, { v: 2 });
    expect(await readOpsState(d.state)).toBeNull();
    writeFileSync(path.join(d.state, 'ops.json'), ' '.repeat(70_000));
    expect(await readOpsState(d.state)).toBeNull();
  });

  it('lit l’usage Docker validé', async () => {
    const d = dirs();
    const docker = {
      measuredAt: NOW.toISOString(),
      images: { count: 3, activeCount: 1, totalBytes: 10, reclaimableBytes: 4 },
      buildCache: { totalBytes: 0, reclaimableBytes: 0 },
      volumes: { count: 1, totalBytes: 5, reclaimableBytes: 0 },
    };
    writeFileSync(path.join(d.state, 'docker.json'), JSON.stringify(docker));
    expect(await readDockerUsage(d.state)).toEqual(docker);
    writeFileSync(path.join(d.state, 'docker.json'), JSON.stringify({ ...docker, images: null }));
    expect(await readDockerUsage(d.state)).toBeNull();
  });
});

describe('createOpsRelay.submit', () => {
  it('la trace PRÉCÈDE le dépôt : au moment où elle s’écrit, aucune demande n’existe ; refusée, rien n’est déposé', async () => {
    const d = dirs();
    const seen: string[][] = [];
    const relay = createOpsRelay({ env: env(d), now: () => NOW, newId: ids(ID_A) });
    const accepted = await relay.submit({
      operation: 'backup',
      requestedBy: 'x',
      beforeDeposit: async (requestId) => {
        seen.push([requestId, ...readdirSync(d.requests)]);
        return true;
      },
    });
    expect(accepted.kind).toBe('queued');
    expect(seen).toEqual([[ID_A]]);

    const other = dirs();
    const refused = createOpsRelay({ env: env(other), now: () => NOW, newId: ids(ID_B) });
    expect(await refused.submit({ operation: 'backup', requestedBy: 'x', beforeDeposit: async () => false })).toEqual({
      kind: 'refused',
      status: 503,
      code: 'AUDIT_UNAVAILABLE',
    });
    expect(readdirSync(other.requests)).toEqual([]);
  });

  it('dépose une demande stricte, nommée par son uuid, et rien d’autre', async () => {
    const d = dirs();
    writeState(d.state, { v: 1, runs: { backup: null, 'image-prune': null }, lastAcceptedAt: { backup: null, 'image-prune': null } });
    const relay = createOpsRelay({ env: env(d), now: () => NOW, newId: ids(ID_A) });
    const result = await relay.submit({ operation: 'backup', requestedBy: 'jcnm', beforeDeposit: audited });
    expect(result).toEqual({
      kind: 'queued',
      accepted: { requestId: ID_A, operation: 'backup', status: 'queued', queuedAt: NOW.toISOString() },
    });
    expect(readdirSync(d.requests)).toEqual([`${ID_A}.json`]);
    const raw = readFileSync(path.join(d.requests, `${ID_A}.json`), 'utf8');
    expect(Buffer.byteLength(raw)).toBeLessThanOrEqual(1024);
    expect(opsRequestFileSchema.parse(JSON.parse(raw))).toEqual({
      v: 1,
      id: ID_A,
      action: 'backup',
      environment: 'staging',
      requestedBy: 'jcnm',
      requestedAt: NOW.toISOString(),
    });
  });

  it('refuse 503 sans dossier de demandes, ou s’il n’est pas inscriptible', async () => {
    const d = dirs();
    const sans = createOpsRelay({ env: { ...env(d), OPS_REQUESTS_DIR: undefined }, now: () => NOW, newId: ids() });
    expect(await sans.submit({ operation: 'backup', requestedBy: 'x', beforeDeposit: audited })).toEqual({ kind: 'refused', status: 503, code: 'OPS_RELAY_UNAVAILABLE' });
    const absent = createOpsRelay({ env: { ...env(d), OPS_REQUESTS_DIR: path.join(d.requests, 'nope') }, now: () => NOW, newId: ids() });
    expect(await absent.submit({ operation: 'backup', requestedBy: 'x', beforeDeposit: audited })).toEqual({ kind: 'refused', status: 503, code: 'OPS_RELAY_UNAVAILABLE' });
    if (process.getuid?.() !== 0) {
      chmodSync(d.requests, 0o500);
      const lecture = createOpsRelay({ env: env(d), now: () => NOW, newId: ids() });
      expect(await lecture.submit({ operation: 'backup', requestedBy: 'x', beforeDeposit: audited })).toEqual({ kind: 'refused', status: 503, code: 'OPS_RELAY_UNAVAILABLE' });
      chmodSync(d.requests, 0o700);
    }
  });

  it('refuse 409 OPERATION_COOLDOWN avant la fin du délai, et dit quand', async () => {
    const d = dirs();
    writeState(d.state, {
      v: 1,
      runs: { backup: run(), 'image-prune': null },
      lastAcceptedAt: { backup: '2026-10-12T20:00:00.000Z', 'image-prune': '2026-10-12T19:00:00.000Z' },
    });
    const relay = createOpsRelay({ env: env(d), now: () => NOW, newId: ids(ID_A) });
    expect(await relay.submit({ operation: 'backup', requestedBy: 'x', beforeDeposit: audited })).toEqual({
      kind: 'refused',
      status: 409,
      code: 'OPERATION_COOLDOWN',
      availableAt: '2026-10-13T02:00:00.000Z',
    });
    // image-prune : 1 h de délai, dernière acceptation il y a 3 h ⇒ autorisé.
    expect((await relay.submit({ operation: 'image-prune', requestedBy: 'x', beforeDeposit: audited })).kind).toBe('queued');
    expect(readdirSync(d.requests)).toEqual([`${ID_A}.json`]);
  });

  it('refuse 409 OPERATION_IN_PROGRESS quand une demande attend ou tourne', async () => {
    const d = dirs();
    const relay = createOpsRelay({ env: env(d), now: () => NOW, newId: ids(ID_A, ID_B) });
    expect((await relay.submit({ operation: 'image-prune', requestedBy: 'x', beforeDeposit: audited })).kind).toBe('queued');
    expect(await relay.submit({ operation: 'image-prune', requestedBy: 'x', beforeDeposit: audited })).toEqual({
      kind: 'refused',
      status: 409,
      code: 'OPERATION_IN_PROGRESS',
    });

    const e = dirs();
    writeState(e.state, {
      v: 1,
      runs: { backup: run({ status: 'running', requestedAt: '2026-10-12T21:59:00.000Z', finishedAt: null }), 'image-prune': null },
      lastAcceptedAt: { backup: null, 'image-prune': null },
    });
    const running = createOpsRelay({ env: env(e), now: () => NOW, newId: ids() });
    expect(await running.submit({ operation: 'backup', requestedBy: 'x', beforeDeposit: audited })).toEqual({
      kind: 'refused',
      status: 409,
      code: 'OPERATION_IN_PROGRESS',
    });
  });

  it('deux demandes simultanées ne passent pas toutes les deux', async () => {
    const d = dirs();
    const relay = createOpsRelay({ env: env(d), now: () => NOW, newId: ids(ID_A, ID_B) });
    const results = await Promise.all([
      relay.submit({ operation: 'backup', requestedBy: 'x', beforeDeposit: audited }),
      relay.submit({ operation: 'backup', requestedBy: 'x', beforeDeposit: audited }),
    ]);
    expect(results.map((r) => r.kind).sort()).toEqual(['queued', 'refused']);
    expect(readdirSync(d.requests)).toHaveLength(1);
  });
});

describe('createOpsRelay.status', () => {
  it('sert les passages, la prochaine disponibilité et l’installation du relais', async () => {
    const d = dirs();
    writeState(d.state, {
      v: 1,
      runs: { backup: run(), 'image-prune': null },
      lastAcceptedAt: { backup: '2026-10-12T20:00:00.000Z', 'image-prune': '2026-10-12T19:00:00.000Z' },
    });
    const relay = createOpsRelay({ env: env(d), now: () => NOW, newId: ids() });
    expect(await relay.status()).toEqual({
      environment: 'staging',
      relayInstalled: true,
      runs: { backup: run(), 'image-prune': null },
      availableAt: { backup: '2026-10-13T02:00:00.000Z', 'image-prune': null },
    });
  });

  it('montre une demande déposée que le runner n’a pas encore prise', async () => {
    const d = dirs();
    writeState(d.state, { v: 1, runs: { backup: null, 'image-prune': null }, lastAcceptedAt: { backup: null, 'image-prune': null } });
    const relay = createOpsRelay({ env: env(d), now: () => NOW, newId: ids(ID_A) });
    await relay.submit({ operation: 'image-prune', requestedBy: 'jcnm', beforeDeposit: audited });
    const status = await relay.status();
    expect(status.runs['image-prune']).toEqual({
      requestId: ID_A,
      operation: 'image-prune',
      status: 'queued',
      requestedBy: 'jcnm',
      requestedAt: NOW.toISOString(),
      startedAt: null,
      finishedAt: null,
      reclaimedBytes: null,
      code: null,
    });
  });

  it('dit le relais absent sans état publié', async () => {
    const d = dirs();
    const relay = createOpsRelay({ env: env(d), now: () => NOW, newId: ids() });
    const status = await relay.status();
    expect(status.relayInstalled).toBe(false);
    expect(status.runs).toEqual({ backup: null, 'image-prune': null });
  });
});
