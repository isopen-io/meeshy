import { describe, it, expect } from 'vitest';
import {
  HOST_METRICS_BUFFER_SIZE,
  HOST_METRICS_SAMPLE_INTERVAL_MS,
  SERVER_OPERATIONS,
  SERVER_OPERATION_COOLDOWN_MS,
  dockerUsageSchema,
  hostGpuSchema,
  hostMetricsSampleSchema,
  hostMetricsSnapshotSchema,
  opsRequestFileSchema,
  serverOperationRequestBodySchema,
  serverOperationStateFileSchema,
  serverOperationStatusSchema,
} from '../types/admin-ops.js';
import { CLIENT_EVENTS, ROOMS, SERVER_EVENTS } from '../types/socketio-events.js';

const AT = '2026-10-12T22:00:00.000Z';
const REQUEST_ID = '0b4f8a0e-6f43-4a4c-9a4b-2d2c7f7d1c11';

const sample = (overrides: Record<string, unknown> = {}) => ({
  at: AT,
  cpu: { usedPercent: 12.5, cores: 8, load1: 0.5, load5: 0.4, load15: 0.3 },
  memory: { totalBytes: 16_000, availableBytes: 6_000, usedBytes: 10_000 },
  swap: { totalBytes: 0, usedBytes: 0 },
  disk: { mount: '/', totalBytes: 100, freeBytes: 40, usedBytes: 60 },
  ...overrides,
});

const docker = () => ({
  measuredAt: AT,
  images: { count: 30, activeCount: 9, totalBytes: 9_000, reclaimableBytes: 4_000 },
  buildCache: { totalBytes: 100, reclaimableBytes: 100 },
  volumes: { count: 12, totalBytes: 500, reclaimableBytes: 0 },
});

const run = (overrides: Record<string, unknown> = {}) => ({
  requestId: REQUEST_ID,
  operation: 'backup',
  status: 'succeeded',
  requestedBy: 'jcnm',
  requestedAt: AT,
  startedAt: AT,
  finishedAt: AT,
  reclaimedBytes: null,
  code: null,
  ...overrides,
});

describe('contrat des opérations serveur (#10384–#10386)', () => {
  it('échantillonne toutes les 5 s et garde une heure', () => {
    expect(HOST_METRICS_SAMPLE_INTERVAL_MS).toBe(5000);
    expect(HOST_METRICS_BUFFER_SIZE).toBe(720);
  });

  it('accepte un échantillon complet et refuse un CPU au-delà de 100 % ou des octets négatifs', () => {
    expect(hostMetricsSampleSchema.safeParse(sample()).success).toBe(true);
    expect(
      hostMetricsSampleSchema.safeParse(sample({ cpu: { usedPercent: 101, cores: 8, load1: 0, load5: 0, load15: 0 } })).success
    ).toBe(false);
    expect(
      hostMetricsSampleSchema.safeParse(sample({ swap: { totalBytes: -1, usedBytes: 0 } })).success
    ).toBe(false);
  });

  it('dit l’absence de GPU par une raison fermée', () => {
    expect(hostGpuSchema.safeParse({ kind: 'absent', reason: 'no-compute-gpu' }).success).toBe(true);
    expect(hostGpuSchema.safeParse({ kind: 'absent', reason: 'unknown' }).success).toBe(false);
    expect(
      hostGpuSchema.safeParse({ kind: 'present', name: 'T4', usedPercent: null, memoryUsedBytes: null, memoryTotalBytes: null }).success
    ).toBe(true);
  });

  it('borne l’instantané au tampon de 720 points', () => {
    const snapshot = (count: number) => ({
      source: 'host-proc',
      hostname: 'meeshy',
      sharedHost: true,
      environment: 'staging',
      intervalMs: 5000,
      gpu: { kind: 'absent', reason: 'no-compute-gpu' },
      samples: Array.from({ length: count }, () => sample()),
      docker: docker(),
    });
    expect(hostMetricsSnapshotSchema.safeParse(snapshot(720)).success).toBe(true);
    expect(hostMetricsSnapshotSchema.safeParse(snapshot(721)).success).toBe(false);
    expect(hostMetricsSnapshotSchema.safeParse({ ...snapshot(1), docker: null }).success).toBe(true);
  });

  it('lit l’usage Docker publié par le runner', () => {
    expect(dockerUsageSchema.safeParse(docker()).success).toBe(true);
    expect(dockerUsageSchema.safeParse({ ...docker(), images: { count: 1 } }).success).toBe(false);
  });

  it('ne connaît que deux opérations, avec leurs délais', () => {
    expect(SERVER_OPERATIONS).toEqual(['backup', 'image-prune']);
    expect(SERVER_OPERATION_COOLDOWN_MS).toEqual({ backup: 21_600_000, 'image-prune': 3_600_000 });
  });

  it('exige une confirmation nommée et refuse tout champ en trop', () => {
    expect(serverOperationRequestBodySchema.safeParse({ confirm: 'backup' }).success).toBe(true);
    expect(serverOperationRequestBodySchema.safeParse({ confirm: 'image-prune', reason: '  disque  ' }).data?.reason).toBe('disque');
    expect(serverOperationRequestBodySchema.safeParse({}).success).toBe(false);
    expect(serverOperationRequestBodySchema.safeParse({ confirm: 'system-prune' }).success).toBe(false);
    expect(serverOperationRequestBodySchema.safeParse({ confirm: 'backup', command: 'rm -rf /' }).success).toBe(false);
    expect(serverOperationRequestBodySchema.safeParse({ confirm: 'backup', reason: 'x'.repeat(501) }).success).toBe(false);
  });

  it('le fichier de demande est strict : version, uuid, action de la liste blanche', () => {
    const request = { v: 1, id: REQUEST_ID, action: 'backup', environment: 'staging', requestedBy: 'jcnm', requestedAt: AT };
    expect(opsRequestFileSchema.safeParse(request).success).toBe(true);
    expect(opsRequestFileSchema.safeParse({ ...request, v: 2 }).success).toBe(false);
    expect(opsRequestFileSchema.safeParse({ ...request, id: 'x' }).success).toBe(false);
    expect(opsRequestFileSchema.safeParse({ ...request, action: 'shell' }).success).toBe(false);
    expect(opsRequestFileSchema.safeParse({ ...request, extra: true }).success).toBe(false);
  });

  it('l’état publié nomme un dernier passage par opération', () => {
    const state = {
      v: 1,
      runs: { backup: run(), 'image-prune': null },
      lastAcceptedAt: { backup: AT, 'image-prune': null },
    };
    expect(serverOperationStateFileSchema.safeParse(state).success).toBe(true);
    expect(serverOperationStateFileSchema.safeParse({ ...state, runs: { backup: run() } }).success).toBe(false);
    expect(
      serverOperationStateFileSchema.safeParse({ ...state, runs: { backup: run({ code: 'x'.repeat(65) }), 'image-prune': null } }).success
    ).toBe(false);
  });

  it('le statut servi porte l’environnement, le relais et la prochaine disponibilité', () => {
    expect(
      serverOperationStatusSchema.safeParse({
        environment: 'staging',
        relayInstalled: true,
        runs: { backup: null, 'image-prune': run({ operation: 'image-prune', reclaimedBytes: 1024 }) },
        availableAt: { backup: null, 'image-prune': AT },
      }).success
    ).toBe(true);
  });

  it('nomme ses événements socket au format entity:action-word et sa room', () => {
    expect(CLIENT_EVENTS.ADMIN_METRICS_SUBSCRIBE).toBe('admin-metrics:subscribe');
    expect(CLIENT_EVENTS.ADMIN_METRICS_UNSUBSCRIBE).toBe('admin-metrics:unsubscribe');
    expect(SERVER_EVENTS.ADMIN_METRICS_SAMPLE).toBe('admin-metrics:sample');
    expect(ROOMS.adminHostMetrics()).toBe('admin:host-metrics');
  });
});
