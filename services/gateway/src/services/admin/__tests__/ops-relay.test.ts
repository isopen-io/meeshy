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
/** Le nettoyage n'est permis que de 02:00 à 06:00 heure de Paris (#11452) : NOW tombe à minuit à Paris, NIGHT à 03:00. */
const NIGHT = new Date('2026-10-13T01:00:00.000Z');
const PRUNE_WINDOW = { timeZone: 'Europe/Paris', startHour: 2, endHour: 6 } as const;
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

  it('ce que le runner publie est borné champ par champ : un demandeur de plus de 128 caractères invalide l’état entier (#10459)', async () => {
    const d = dirs();
    writeState(d.state, { v: 1, runs: { backup: run({ requestedBy: 'x'.repeat(129) }), 'image-prune': null }, lastAcceptedAt: { backup: null, 'image-prune': null } });
    expect(await readOpsState(d.state)).toBeNull();
    writeState(d.state, { v: 1, runs: { backup: run({ code: 'c'.repeat(65) }), 'image-prune': null }, lastAcceptedAt: { backup: null, 'image-prune': null } });
    expect(await readOpsState(d.state)).toBeNull();
  });

  it('la borne de lecture est celle des OCTETS LUS : un état d’un octet au-dessus du plafond vaut null, un dossier à la place du fichier aussi', async () => {
    const d = dirs();
    const ok = { v: 1, runs: { backup: run(), 'image-prune': null }, lastAcceptedAt: { backup: null, 'image-prune': null } };
    const body = JSON.stringify(ok);
    writeFileSync(path.join(d.state, 'ops.json'), body + ' '.repeat(64 * 1024 - body.length));
    expect(await readOpsState(d.state)).toEqual(ok);
    writeFileSync(path.join(d.state, 'ops.json'), body + ' '.repeat(64 * 1024 - body.length + 1));
    expect(await readOpsState(d.state)).toBeNull();
    const other = dirs();
    mkdirSync(path.join(other.state, 'ops.json'));
    expect(await readOpsState(other.state)).toBeNull();
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
    // image-prune, à 03:00 à Paris : 1 h de délai, dernière acceptation il y a 6 h ⇒ autorisé.
    const night = createOpsRelay({ env: env(d), now: () => NIGHT, newId: ids(ID_A) });
    expect((await night.submit({ operation: 'image-prune', requestedBy: 'x', beforeDeposit: audited })).kind).toBe('queued');
    expect(readdirSync(d.requests)).toEqual([`${ID_A}.json`]);
  });

  it('refuse 409 OPERATION_IN_PROGRESS quand une demande attend ou tourne', async () => {
    const d = dirs();
    const relay = createOpsRelay({ env: env(d), now: () => NIGHT, newId: ids(ID_A, ID_B) });
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

  describe('la fenêtre du nettoyage : de 02:00 à 06:00, heure de Paris (#11452)', () => {
    const submitAt = async (at: string, lastPrune: string | null = null) => {
      const d = dirs();
      writeState(d.state, { v: 1, runs: { backup: null, 'image-prune': null }, lastAcceptedAt: { backup: null, 'image-prune': lastPrune } });
      const traces: string[] = [];
      const relay = createOpsRelay({ env: env(d), now: () => new Date(at), newId: ids(ID_A) });
      const result = await relay.submit({
        operation: 'image-prune',
        requestedBy: 'x',
        beforeDeposit: async (requestId) => {
          traces.push(requestId);
          return true;
        },
      });
      return { result, traced: traces.length, deposited: readdirSync(d.requests) };
    };

    it('hors fenêtre, refuse 409 OPERATION_OUTSIDE_WINDOW avant toute trace et tout dépôt, et dit la prochaine ouverture', async () => {
      expect(await submitAt(NOW.toISOString())).toEqual({
        result: { kind: 'refused', status: 409, code: 'OPERATION_OUTSIDE_WINDOW', availableAt: '2026-10-13T00:00:00.000Z' },
        traced: 0,
        deposited: [],
      });
      expect((await submitAt('2026-10-13T04:00:00.000Z')).result).toEqual({
        kind: 'refused',
        status: 409,
        code: 'OPERATION_OUTSIDE_WINDOW',
        availableAt: '2026-10-14T00:00:00.000Z',
      });
    });

    it('dans la fenêtre, 02:00 inclus et 06:00 exclu, la demande est déposée', async () => {
      expect((await submitAt('2026-10-13T00:00:00.000Z')).result.kind).toBe('queued');
      expect((await submitAt('2026-10-13T03:59:59.000Z')).deposited).toEqual([`${ID_A}.json`]);
    });

    it('sous un délai qui finit après 06:00, c’est l’ouverture du lendemain qui répond, jamais la fin du délai', async () => {
      expect((await submitAt('2026-10-13T03:30:00.000Z', '2026-10-13T03:15:00.000Z')).result).toEqual({
        kind: 'refused',
        status: 409,
        code: 'OPERATION_COOLDOWN',
        availableAt: '2026-10-14T00:00:00.000Z',
      });
      expect((await submitAt('2026-10-13T01:00:00.000Z', '2026-10-13T00:30:00.000Z')).result).toEqual({
        kind: 'refused',
        status: 409,
        code: 'OPERATION_COOLDOWN',
        availableAt: '2026-10-13T01:30:00.000Z',
      });
    });

    it('hors fenêtre ET sous un délai : la fenêtre refuse, à la date qui satisfait les deux', async () => {
      expect((await submitAt('2026-10-12T21:30:00.000Z', '2026-10-12T21:15:00.000Z')).result).toEqual({
        kind: 'refused',
        status: 409,
        code: 'OPERATION_OUTSIDE_WINDOW',
        availableAt: '2026-10-13T00:00:00.000Z',
      });
      expect((await submitAt('2026-10-12T23:30:00.000Z', '2026-10-12T23:20:00.000Z')).result).toEqual({
        kind: 'refused',
        status: 409,
        code: 'OPERATION_OUTSIDE_WINDOW',
        availableAt: '2026-10-13T00:20:00.000Z',
      });
    });

    it('passage à l’heure d’été (29 mars 2026) : la fenêtre s’ouvre à 01:00 UTC et ferme à 04:00 UTC', async () => {
      expect((await submitAt('2026-03-29T00:30:00.000Z')).result).toEqual({
        kind: 'refused',
        status: 409,
        code: 'OPERATION_OUTSIDE_WINDOW',
        availableAt: '2026-03-29T01:00:00.000Z',
      });
      expect((await submitAt('2026-03-29T01:00:00.000Z')).result.kind).toBe('queued');
      expect((await submitAt('2026-03-29T04:00:00.000Z')).result).toMatchObject({ code: 'OPERATION_OUTSIDE_WINDOW', availableAt: '2026-03-30T00:00:00.000Z' });
    });

    it('retour à l’heure d’hiver (25 octobre 2026) : la fenêtre s’ouvre à 00:00 UTC et ferme à 05:00 UTC', async () => {
      expect((await submitAt('2026-10-24T23:59:00.000Z')).result).toMatchObject({ code: 'OPERATION_OUTSIDE_WINDOW', availableAt: '2026-10-25T00:00:00.000Z' });
      expect((await submitAt('2026-10-25T00:00:00.000Z')).result.kind).toBe('queued');
      expect((await submitAt('2026-10-25T04:59:00.000Z')).result.kind).toBe('queued');
      expect((await submitAt('2026-10-25T05:00:00.000Z')).result).toMatchObject({ code: 'OPERATION_OUTSIDE_WINDOW', availableAt: '2026-10-26T01:00:00.000Z' });
      expect((await submitAt('2026-10-25T04:30:00.000Z', '2026-10-25T04:15:00.000Z')).result).toMatchObject({
        code: 'OPERATION_COOLDOWN',
        availableAt: '2026-10-26T01:00:00.000Z',
      });
    });

    it('la sauvegarde n’est jamais restreinte par l’heure', async () => {
      for (const at of ['2026-10-12T22:00:00.000Z', '2026-10-13T12:00:00.000Z', '2026-10-25T05:30:00.000Z', '2026-03-29T00:30:00.000Z']) {
        const d = dirs();
        const relay = createOpsRelay({ env: env(d), now: () => new Date(at), newId: ids(ID_A) });
        expect((await relay.submit({ operation: 'backup', requestedBy: 'x', beforeDeposit: audited })).kind).toBe('queued');
        expect((await relay.status()).windows.backup).toBeNull();
      }
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
  it('sert les passages, la prochaine disponibilité, la fenêtre et l’installation du relais', async () => {
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
      // Minuit à Paris : le délai du nettoyage est écoulé, mais la fenêtre n'ouvre qu'à 02:00.
      availableAt: { backup: '2026-10-13T02:00:00.000Z', 'image-prune': '2026-10-13T00:00:00.000Z' },
      windows: { backup: null, 'image-prune': { ...PRUNE_WINDOW, open: false } },
    });
    const night = createOpsRelay({ env: env(d), now: () => NIGHT, newId: ids() });
    const served = await night.status();
    expect(served.availableAt).toEqual({ backup: '2026-10-13T02:00:00.000Z', 'image-prune': null });
    expect(served.windows).toEqual({ backup: null, 'image-prune': { ...PRUNE_WINDOW, open: true } });
  });

  it('la disponibilité servie tient le délai ET la fenêtre : un délai qui finit après 06:00 renvoie à l’ouverture du lendemain (#11452)', async () => {
    const d = dirs();
    writeState(d.state, {
      v: 1,
      runs: { backup: null, 'image-prune': null },
      lastAcceptedAt: { backup: null, 'image-prune': '2026-10-13T03:30:00.000Z' },
    });
    const relay = createOpsRelay({ env: env(d), now: () => new Date('2026-10-13T03:45:00.000Z'), newId: ids() });
    const status = await relay.status();
    expect(status.availableAt['image-prune']).toBe('2026-10-14T00:00:00.000Z');
    expect(status.windows['image-prune']?.open).toBe(true);
  });

  it('montre une demande déposée que le runner n’a pas encore prise', async () => {
    const d = dirs();
    writeState(d.state, { v: 1, runs: { backup: null, 'image-prune': null }, lastAcceptedAt: { backup: null, 'image-prune': null } });
    const relay = createOpsRelay({ env: env(d), now: () => NIGHT, newId: ids(ID_A) });
    await relay.submit({ operation: 'image-prune', requestedBy: 'jcnm', beforeDeposit: audited });
    const status = await relay.status();
    expect(status.runs['image-prune']).toEqual({
      requestId: ID_A,
      operation: 'image-prune',
      status: 'queued',
      requestedBy: 'jcnm',
      requestedAt: NIGHT.toISOString(),
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
