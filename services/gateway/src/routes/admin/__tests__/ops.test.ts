/**
 * Les routes d'opérations serveur de l'administration (#10384–#10386) :
 * - GET /host-metrics : BIGBOSS et ADMIN, l'instantané de la sonde ;
 * - GET /status : BIGBOSS et ADMIN, l'état publié par le runner ;
 * - POST /:operation : BIGBOSS et ADMIN, confirmation nommée, délai, audit avant dépôt.
 *
 * Les réponses traversent le vrai sérialiseur (`app.inject`) : un témoin assert
 * sur ce que la réponse DIT, jamais sur le seul statut.
 *
 * @jest-environment node
 */
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { HostMetricsSnapshot } from '@meeshy/shared/types/admin-ops';
import { buildAdminOpsRoutes, memoryRefusalGate } from '../ops';
import { createOpsRelay } from '../../../services/admin/ops-relay';
import type { HostMetricsProbe } from '../../../services/admin/host-metrics-probe';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined }),
  },
}));

const ACTOR_ID = '507f1f77bcf86cd799439011';
const NOW = new Date('2026-10-12T22:00:00.000Z');
const REQUEST_ID = '0b4f8a0e-6f43-4a4c-9a4b-2d2c7f7d1c11';

const SAMPLE = {
  at: '2026-10-12T21:59:55.000Z',
  cpu: { usedPercent: 37.5, cores: 8, load1: 1.2, load5: 0.9, load15: 0.7 },
  memory: { totalBytes: 16_000, availableBytes: 6_000, usedBytes: 10_000 },
  swap: { totalBytes: 2_000, usedBytes: 100 },
  disk: { mount: '/', totalBytes: 100_000, freeBytes: 30_000, usedBytes: 70_000 },
};

const SNAPSHOT: HostMetricsSnapshot = {
  source: 'host-proc',
  hostname: 'meeshy',
  sharedHost: true,
  environment: 'staging',
  intervalMs: 5000,
  gpu: { kind: 'absent', reason: 'no-compute-gpu' },
  samples: [SAMPLE],
  docker: {
    measuredAt: NOW.toISOString(),
    images: { count: 30, activeCount: 9, totalBytes: 9_000, reclaimableBytes: 4_000 },
    buildCache: { totalBytes: 100, reclaimableBytes: 100 },
    volumes: { count: 12, totalBytes: 500, reclaimableBytes: 0 },
  },
};

const roots: string[] = [];
afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

function opsDirs() {
  const root = mkdtempSync(path.join(tmpdir(), 'ops-route-'));
  roots.push(root);
  const requests = path.join(root, 'requests');
  const state = path.join(root, 'state');
  mkdirSync(requests);
  mkdirSync(state);
  return { requests, state };
}

type Options = { role?: string | null; relayDirs?: { requests: string; state: string } | null; backupDir?: string; backupSchedule?: { hour: number; minute: number } };

async function buildApp({ role = 'BIGBOSS', relayDirs, backupDir, backupSchedule }: Options = {}) {
  const dirs = relayDirs === undefined ? opsDirs() : relayDirs;
  const audit = jest.fn<(args: unknown) => Promise<unknown>>(async () => ({}));
  const snapshot = jest.fn<(since?: Date) => Promise<HostMetricsSnapshot>>(async () => SNAPSHOT);
  const probe: HostMetricsProbe = {
    start: () => undefined,
    stop: () => undefined,
    prime: async () => undefined,
    tick: async () => null,
    snapshot,
    onSample: () => () => undefined,
  };
  const relay = createOpsRelay({
    env: {
      OPS_ENVIRONMENT: 'staging',
      OPS_REQUESTS_DIR: dirs?.requests,
      OPS_STATE_DIR: dirs?.state,
    },
    now: () => NOW,
    newId: () => REQUEST_ID,
  });
  const app: FastifyInstance = Fastify({ logger: false });
  app.decorate('prisma', { adminAuditLog: { create: audit } } as never);
  app.decorate('authenticate', async (request: FastifyRequest) => {
    if (role === null) return;
    Object.assign(request, { authContext: {
      isAuthenticated: true,
      isAnonymous: false,
      userId: ACTOR_ID,
      registeredUser: { id: ACTOR_ID, role, username: 'acteur' },
    } });
  });
  await app.register(buildAdminOpsRoutes({ probe, relay, now: () => NOW, backupStatusFile: path.join(backupDir ?? '/nonexistent', 'etat.json'), ...(backupSchedule ? { backupSchedule } : {}) }));
  await app.ready();
  return { app, audit, snapshot, dirs };
}

describe('memoryRefusalGate', () => {
  it('admet une clé une fois par fenêtre, la réadmet après, et cède la plus ancienne au-delà du plafond', () => {
    let at = 0;
    const gate = memoryRefusalGate({ windowMs: 1_000, maxKeys: 2, now: () => at });
    expect(gate.admit('a')).toBe(true);
    expect(gate.admit('a')).toBe(false);
    at = 999;
    expect(gate.admit('a')).toBe(false);
    at = 1_000;
    expect(gate.admit('a')).toBe(true);
    expect(gate.admit('b')).toBe(true);
    expect(gate.admit('c')).toBe(true);
    expect(gate.admit('b')).toBe(false);
    expect(gate.admit('a')).toBe(true);
  });
});

describe('GET /host-metrics', () => {
  it.each(['BIGBOSS', 'ADMIN'])('sert l’instantané complet à un %s', async (role) => {
    const { app } = await buildApp({ role });
    const res = await app.inject({ method: 'GET', url: '/host-metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: SNAPSHOT });
    await app.close();
  });

  it.each(['AUDIT', 'MODERATOR', 'ANALYST', 'USER'])('refuse un %s', async (role) => {
    const { app } = await buildApp({ role });
    expect((await app.inject({ method: 'GET', url: '/host-metrics' })).statusCode).toBe(403);
    await app.close();
  });

  it('passe since à la sonde, et refuse un since illisible', async () => {
    const { app, snapshot } = await buildApp();
    await app.inject({ method: 'GET', url: '/host-metrics?since=2026-10-12T21:00:00.000Z' });
    expect(snapshot).toHaveBeenLastCalledWith(new Date('2026-10-12T21:00:00.000Z'));
    const bad = await app.inject({ method: 'GET', url: '/host-metrics?since=hier' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('VALIDATION_ERROR');
    await app.close();
  });
});

describe('POST /:operation', () => {
  const post = (app: FastifyInstance, operation: string, body: unknown) =>
    app.inject({ method: 'POST', url: `/${operation}`, payload: body as Record<string, unknown> });

  it('BIGBOSS : 202, la demande est déposée et l’audit nomme le demandeur', async () => {
    const { app, audit, dirs } = await buildApp();
    const res = await post(app, 'backup', { confirm: 'backup', reason: 'avant migration' });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({
      success: true,
      data: { requestId: REQUEST_ID, operation: 'backup', status: 'queued', queuedAt: NOW.toISOString() },
    });
    expect(readdirSync(dirs!.requests)).toEqual([`${REQUEST_ID}.json`]);
    expect(audit).toHaveBeenCalledTimes(1);
    const entry = (audit.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(entry).toMatchObject({
      adminId: ACTOR_ID,
      userId: ACTOR_ID,
      action: 'TRIGGER_SERVER_OPERATION',
      entity: 'Server',
      entityId: 'staging',
    });
    expect(JSON.parse(entry.metadata as string)).toEqual({
      operation: 'backup',
      requestId: REQUEST_ID,
      environment: 'staging',
      reason: 'avant migration',
    });
    await app.close();
  });

  it('ADMIN : 202 aussi — le rang d’administration lance sauvegarde et nettoyage (#11441)', async () => {
    const { app, audit, dirs } = await buildApp({ role: 'ADMIN' });
    const res = await post(app, 'image-prune', { confirm: 'image-prune' });
    expect(res.statusCode).toBe(202);
    expect(readdirSync(dirs!.requests)).toEqual([`${REQUEST_ID}.json`]);
    expect((audit.mock.calls[0][0] as { data: Record<string, unknown> }).data).toMatchObject({ action: 'TRIGGER_SERVER_OPERATION', adminId: ACTOR_ID });
    await app.close();
  });

  it.each(['MODERATOR', 'AUDIT'])('refuse 403 à un %s, sans rien déposer, et JOURNALISE la tentative (#10459)', async (role) => {
    const { app, audit, dirs } = await buildApp({ role });
    expect((await post(app, 'backup', { confirm: 'backup' })).statusCode).toBe(403);
    expect(readdirSync(dirs!.requests)).toEqual([]);
    expect(audit).toHaveBeenCalledTimes(1);
    const entry = (audit.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(entry).toMatchObject({ action: 'SERVER_OPERATION_REFUSED', adminId: ACTOR_ID, entity: 'Server', entityId: 'staging' });
    expect(JSON.parse(entry.metadata as string)).toEqual({ operation: 'backup', environment: 'staging', code: 'FORBIDDEN' });
    await app.close();
  });

  it.each(['ANALYST', 'USER'])('refuse 403 à un %s sans rien journaliser : il n’entre pas dans l’administration', async (role) => {
    const { app, audit } = await buildApp({ role });
    expect((await post(app, 'backup', { confirm: 'backup' })).statusCode).toBe(403);
    expect(audit).not.toHaveBeenCalled();
    await app.close();
  });

  it('cinquante refus répétés du même acteur ne laissent qu’UNE trace (aucune amplification d’écritures)', async () => {
    const { app, audit } = await buildApp({ role: 'MODERATOR' });
    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect((await post(app, 'backup', { confirm: 'backup' })).statusCode).toBe(403);
    }
    expect(audit).toHaveBeenCalledTimes(1);
    await post(app, 'image-prune', { confirm: 'image-prune' });
    expect(audit).toHaveBeenCalledTimes(2);
    await app.close();
  });

  it('un User-Agent démesuré est gardé tronqué à 256 caractères', async () => {
    const { app, audit } = await buildApp();
    await app.inject({ method: 'POST', url: '/backup', payload: { confirm: 'backup' }, headers: { 'user-agent': 'u'.repeat(16 * 1024) } });
    const entry = (audit.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(entry.userAgent).toBe('u'.repeat(256));
    await app.close();
  });

  it('journal indisponible : 503 AUDIT_UNAVAILABLE et AUCUNE demande déposée (fail-closed)', async () => {
    const { app, audit, dirs } = await buildApp();
    audit.mockRejectedValueOnce(new Error('mongo down'));
    const res = await post(app, 'backup', { confirm: 'backup' });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('AUDIT_UNAVAILABLE');
    expect(readdirSync(dirs!.requests)).toEqual([]);
    await app.close();
  });

  it('une tentative sans session n’écrit rien (aucun acteur à nommer)', async () => {
    const { app, audit } = await buildApp({ role: null });
    expect((await post(app, 'backup', { confirm: 'backup' })).statusCode).toBe(401);
    expect(audit).not.toHaveBeenCalled();
    await app.close();
  });

  it('404 UNKNOWN_OPERATION pour une opération hors liste', async () => {
    const { app } = await buildApp();
    const res = await post(app, 'system-prune', { confirm: 'backup' });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('UNKNOWN_OPERATION');
    await app.close();
  });

  it('400 CONFIRMATION_MISMATCH quand la confirmation ne nomme pas l’opération', async () => {
    const { app, dirs } = await buildApp();
    const res = await post(app, 'image-prune', { confirm: 'backup' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('CONFIRMATION_MISMATCH');
    expect(readdirSync(dirs!.requests)).toEqual([]);
    await app.close();
  });

  it('400 VALIDATION_ERROR pour un corps absent ou porteur d’un champ en trop', async () => {
    const { app } = await buildApp();
    expect((await post(app, 'backup', {})).json().code).toBe('VALIDATION_ERROR');
    expect((await post(app, 'backup', { confirm: 'backup', command: 'rm' })).json().code).toBe('VALIDATION_ERROR');
    await app.close();
  });

  it('une confirmation qui ne nomme pas l’opération est JOURNALISÉE comme tentative refusée (#10459)', async () => {
    const { app, audit } = await buildApp();
    await post(app, 'image-prune', { confirm: 'backup' });
    const entry = (audit.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(entry.action).toBe('SERVER_OPERATION_REFUSED');
    expect(JSON.parse(entry.metadata as string)).toEqual({ operation: 'image-prune', environment: 'staging', code: 'CONFIRMATION_MISMATCH' });
    await app.close();
  });

  it('409 OPERATION_COOLDOWN avec data.availableAt', async () => {
    const dirs = opsDirs();
    writeFileSync(
      path.join(dirs.state, 'ops.json'),
      JSON.stringify({ v: 1, runs: { backup: null, 'image-prune': null }, lastAcceptedAt: { backup: '2026-10-12T21:00:00.000Z', 'image-prune': null } }),
    );
    const { app, audit } = await buildApp({ relayDirs: dirs });
    const res = await post(app, 'backup', { confirm: 'backup' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ success: false, code: 'OPERATION_COOLDOWN', data: { availableAt: '2026-10-13T03:00:00.000Z' } });
    expect(audit).toHaveBeenCalledTimes(1);
    const entry = (audit.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(entry.action).toBe('SERVER_OPERATION_REFUSED');
    expect(JSON.parse(entry.metadata as string)).toEqual({ operation: 'backup', environment: 'staging', code: 'OPERATION_COOLDOWN' });
    await app.close();
  });

  it('409 OPERATION_IN_PROGRESS au second appel immédiat', async () => {
    const { app } = await buildApp();
    expect((await post(app, 'image-prune', { confirm: 'image-prune' })).statusCode).toBe(202);
    const second = await post(app, 'image-prune', { confirm: 'image-prune' });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('OPERATION_IN_PROGRESS');
    await app.close();
  });

  it('503 OPS_RELAY_UNAVAILABLE sans relais installé', async () => {
    const { app } = await buildApp({ relayDirs: null });
    const res = await post(app, 'backup', { confirm: 'backup' });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('OPS_RELAY_UNAVAILABLE');
    await app.close();
  });
});

describe('GET /status', () => {
  it('sert l’état des opérations et la carte de la dernière sauvegarde', async () => {
    const dirs = opsDirs();
    writeFileSync(
      path.join(dirs.state, 'ops.json'),
      JSON.stringify({ v: 1, runs: { backup: null, 'image-prune': null }, lastAcceptedAt: { backup: null, 'image-prune': null } }),
    );
    const backupDir = mkdtempSync(path.join(tmpdir(), 'ops-backup-'));
    roots.push(backupDir);
    writeFileSync(
      path.join(backupDir, 'etat.json'),
      JSON.stringify({
        generatedAt: '2026-10-12T20:00:00.000Z',
        status: 'ok',
        reason: null,
        lastSuccessAt: '2026-10-12T20:00:00.000Z',
        lastSuccess: { documents: 10, collections: 2, mismatches: 0, indexes: 4, archiveBytes: 100, durationSeconds: 12, volumes: [] },
      }),
    );
    const { app } = await buildApp({ role: 'ADMIN', relayDirs: dirs, backupDir, backupSchedule: { hour: 2, minute: 30 } });
    const res = await app.inject({ method: 'GET', url: '/status' });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data).toMatchObject({
      environment: 'staging',
      relayInstalled: true,
      runs: { backup: null, 'image-prune': null },
      availableAt: { backup: null, 'image-prune': null },
    });
    expect(data.backup).toMatchObject({ status: 'ok', lastSuccess: { documents: 10, mismatches: 0 }, nextRunAt: '2026-10-13T00:30:00.000Z' });
    await app.close();
  });

  it('refuse un MODERATOR', async () => {
    const { app } = await buildApp({ role: 'MODERATOR' });
    expect((await app.inject({ method: 'GET', url: '/status' })).statusCode).toBe(403);
    await app.close();
  });
});

describe('GET /containers (#11441)', () => {
  const CONTAINER = {
    name: 'meeshy-gateway-staging',
    service: 'gateway-staging',
    image: 'isopen/meeshy-gateway:dev',
    imageId: '3f1c2a9e8b7d',
    imageCreatedAt: '2026-10-11T19:40:00.987Z',
    state: 'running',
    health: 'healthy',
    startedAt: '2026-10-11T20:00:00.123Z',
    finishedAt: null,
    restartCount: 2,
    exitCode: 0,
    stats: {
      cpuPercent: 3.2,
      memoryUsedBytes: 268_435_456,
      memoryLimitBytes: 2_147_483_648,
      netRxBytes: 1_200_000,
      netTxBytes: 3_400_000,
      blockReadBytes: 0,
      blockWriteBytes: 4_100,
      pids: 24,
    },
    networks: [{ name: 'meeshy-staging-network', ipAddress: '172.20.0.5' }],
    ports: [{ containerPort: 443, protocol: 'tcp', hostIp: '0.0.0.0', hostPort: 8443 }],
  };
  const publish = (dirs: { state: string }, body: unknown) => writeFileSync(path.join(dirs.state, 'containers.json'), typeof body === 'string' ? body : JSON.stringify(body));

  it.each(['BIGBOSS', 'ADMIN'])('sert à un %s chaque conteneur publié, champ par champ, à travers le sérialiseur', async (role) => {
    const dirs = opsDirs();
    publish(dirs, { measuredAt: NOW.toISOString(), containers: [CONTAINER] });
    const { app } = await buildApp({ role, relayDirs: dirs });
    const res = await app.inject({ method: 'GET', url: '/containers' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: { environment: 'staging', measuredAt: NOW.toISOString(), containers: [CONTAINER] } });
    await app.close();
  });

  it('ne sert RIEN de ce que le contrat ne déclare pas, même si le fichier le porte', async () => {
    const dirs = opsDirs();
    publish(dirs, { measuredAt: NOW.toISOString(), containers: [{ ...CONTAINER, env: ['JWT_SECRET=fuite'], labels: { a: 'b' } }] });
    const { app } = await buildApp({ relayDirs: dirs });
    const body = (await app.inject({ method: 'GET', url: '/containers' })).body;
    expect(body).not.toContain('JWT_SECRET');
    expect(body).not.toContain('labels');
    await app.close();
  });

  it('sans publication, ou une publication hors contrat : measuredAt null et liste vide, jamais une erreur', async () => {
    const empty = await buildApp();
    expect((await empty.app.inject({ method: 'GET', url: '/containers' })).json()).toEqual({ success: true, data: { environment: 'staging', measuredAt: null, containers: [] } });
    await empty.app.close();

    const dirs = opsDirs();
    publish(dirs, { measuredAt: NOW.toISOString(), containers: [{ ...CONTAINER, state: 'zombie' }] });
    const broken = await buildApp({ relayDirs: dirs });
    expect((await broken.app.inject({ method: 'GET', url: '/containers' })).json().data).toEqual({ environment: 'staging', measuredAt: null, containers: [] });
    await broken.app.close();
  });

  it('refuse un fichier démesuré (frontière de confiance bornée)', async () => {
    const dirs = opsDirs();
    publish(dirs, JSON.stringify({ measuredAt: NOW.toISOString(), containers: [CONTAINER], padding: 'x'.repeat(300 * 1024) }));
    const { app } = await buildApp({ relayDirs: dirs });
    expect((await app.inject({ method: 'GET', url: '/containers' })).json().data.containers).toEqual([]);
    await app.close();
  });

  it.each(['MODERATOR', 'AUDIT', 'USER'])('refuse un %s', async (role) => {
    const { app } = await buildApp({ role });
    expect((await app.inject({ method: 'GET', url: '/containers' })).statusCode).toBe(403);
    await app.close();
  });
});
