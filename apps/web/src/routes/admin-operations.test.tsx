import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import type { HostMetricsSample } from '@meeshy/shared/types/admin-ops';

import type { LiveSource } from '@/lib/admin/use-host-metrics';
import type { AdminDeps } from '@/lib/api/admin';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import type { SocketClient } from '@/lib/net/socket';
import { adminIdentityFixture } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminOperationsPanel } from './admin-operations';

/**
 * L'ÉCRAN OPÉRATIONS (#10396) — l'hôte en direct (jauges, graphes d'une heure, Docker,
 * GPU, hôte partagé), la socket puis le repli, et la sauvegarde / purge réservées au
 * rang souverain, confirmées en tapant leur nom.
 */
const { mount, mounter } = setupAdminKitTests({ languages: ['fr'] });
const GB = 1024 ** 3;
const NOW = new Date('2026-10-12T10:00:00.000Z');

const sample = (at: string, cpu = 20): HostMetricsSample => ({
  at,
  cpu: { usedPercent: cpu, cores: 8, load1: 1.25, load5: 1, load15: 0.5 },
  memory: { totalBytes: 16 * GB, availableBytes: 8 * GB, usedBytes: 8 * GB },
  swap: { totalBytes: 2 * GB, usedBytes: 0 },
  disk: { mount: '/', totalBytes: 100 * GB, freeBytes: 25 * GB, usedBytes: 75 * GB },
});

const SNAPSHOT = {
  source: 'host-proc',
  hostname: 'meeshy',
  sharedHost: true,
  environment: 'staging',
  intervalMs: 5000,
  gpu: { kind: 'absent', reason: 'no-compute-gpu' },
  samples: [sample('2026-10-12T09:59:55.000Z', 10), sample('2026-10-12T10:00:00.000Z', 30)],
  docker: {
    measuredAt: '2026-10-12T09:59:00.000Z',
    images: { count: 40, activeCount: 9, totalBytes: 30 * GB, reclaimableBytes: 18 * GB },
    buildCache: { totalBytes: 2 * GB, reclaimableBytes: 2 * GB },
    volumes: { count: 10, totalBytes: 20 * GB, reclaimableBytes: 0 },
  },
};

const STATUS = {
  environment: 'staging',
  relayInstalled: true,
  runs: { backup: { requestId: 'r1', operation: 'backup', status: 'succeeded', requestedBy: 'u', requestedAt: '2026-10-12T03:00:00.000Z', startedAt: null, finishedAt: '2026-10-12T03:10:00.000Z', reclaimedBytes: null, code: null }, 'image-prune': null },
  availableAt: { backup: '2026-10-12T09:00:00.000Z', 'image-prune': null },
  backup: null,
};

function depsOf(trigger: () => ApiResult<unknown> = () => ({ ok: true, data: { requestId: 'r2', operation: 'backup', status: 'queued', queuedAt: NOW.toISOString() } })) {
  const calls: HttpRequest[] = [];
  const transport: AdminDeps['transport'] = Object.assign(async () => ({ ok: false as const, status: 0, error: 'jamais appelé' }), {
    request: async <T,>(req: HttpRequest): Promise<ApiResult<T>> => {
      calls.push(req);
      if (req.method === 'POST') return trigger() as ApiResult<T>;
      if (req.path.includes('/ops/status')) return { ok: true, data: STATUS } as ApiResult<T>;
      return { ok: true, data: SNAPSHOT } as ApiResult<T>;
    },
  });
  return { deps: { source: 'gateway', transport } satisfies AdminDeps, calls };
}

async function open(
  identity = adminIdentityFixture({ role: 'BIGBOSS' }),
  options: { readonly liveSource?: LiveSource | null; readonly trigger?: () => ApiResult<unknown>; readonly now?: () => Date } = {},
) {
  const { deps, calls } = depsOf(options.trigger);
  const host = await mount(<AdminOperationsPanel language="fr" deps={deps} liveSource={options.liveSource ?? null} now={options.now ?? (() => NOW)} />, identity);
  for (let attempt = 0; attempt < 20 && host.querySelector('[data-admin-ops-operation]') === null; attempt += 1) await mounter.settle();
  return { host, calls };
}

const click = async (element: Element | null) => {
  await act(async () => (element as HTMLElement | null)?.click());
  await mounter.settle();
};

describe('l’hôte en direct', () => {
  test('les jauges de la dernière mesure, Docker récupérable, aucun GPU de calcul, hôte partagé', async () => {
    const { host } = await open();
    expect(host.querySelector('[data-admin-stat="ops-cpu"]')?.textContent).toContain('30');
    expect(host.querySelector('[data-admin-stat="ops-memory"]')?.textContent).toContain('50');
    expect(host.querySelector('[data-admin-stat="ops-disk"]')?.textContent).toContain('75');
    expect(host.querySelector('[data-admin-stat="ops-docker"]')?.textContent).toContain('20');
    expect(host.querySelector('[data-admin-stat="ops-gpu"]')?.textContent).toContain('Aucun GPU de calcul');
    expect(host.querySelector('[data-admin-ops-shared]')?.textContent).toContain('staging et la production');
  });

  test('quatre graphes d’une heure : processeur, charge 1/5/15, mémoire et swap, disque', async () => {
    const { host } = await open();
    expect([...host.querySelectorAll('[data-admin-ops-charts] [data-admin-chart]')].map((chart) => chart.getAttribute('data-admin-chart'))).toEqual(['ops-cpu', 'ops-load', 'ops-memory', 'ops-disk']);
    expect(host.querySelectorAll('[data-admin-chart="ops-load"] [data-admin-series]').length).toBe(3);
  });

  test('par la socket : l’accusé rend l’instantané, un échantillon s’ajoute, le badge dit « En direct »', async () => {
    const handlers = new Map<string, (payload: unknown) => void>();
    const emitted: string[] = [];
    const socket: SocketClient = {
      connected: true,
      connect: () => undefined,
      disconnect: () => undefined,
      on: (event, handler) => void handlers.set(event, handler as (payload: unknown) => void),
      off: (event) => void handlers.delete(event),
      emit: (event) => void emitted.push(event),
      emitWithAck: async (event) => {
        emitted.push(event);
        return { ok: true, snapshot: SNAPSHOT };
      },
    };
    const liveSource: LiveSource = async (watcher) => watcher(socket);
    const { host } = await open(undefined, { liveSource });
    await mounter.settle();
    expect(emitted).toContain('admin-metrics:subscribe');
    expect(host.querySelector('[data-admin-ops-live]')?.getAttribute('data-admin-ops-live')).toBe('socket');
    await act(async () => handlers.get('admin-metrics:sample')?.(sample('2026-10-12T10:00:05.000Z', 90)));
    await mounter.settle();
    expect(host.querySelector('[data-admin-stat="ops-cpu"]')?.textContent).toContain('90');
  });
});

describe('la sauvegarde et la purge', () => {
  test('au rang souverain : taper le nom de l’opération l’autorise, la demande part avec confirm', async () => {
    const { host, calls } = await open();
    await click(host.querySelector('[data-admin-ops-trigger="image-prune"]'));
    const go = () => document.querySelector<HTMLButtonElement>('[data-admin-ops-go="image-prune"]');
    expect(go()?.disabled).toBe(true);
    mounter.type(document, '[data-admin-ops-typed]', 'image-prune');
    expect(go()?.disabled).toBe(false);
    await click(go());
    const post = calls.find((call) => call.method === 'POST');
    expect(post?.path).toBe('/api/v1/admin/ops/image-prune');
    expect(post?.body).toEqual({ confirm: 'image-prune' });
  });

  test('le dernier passage se dit ; un refus « trop tôt » se dit en mots', async () => {
    const { host } = await open(undefined, { trigger: () => ({ ok: false, status: 409, error: 'x', code: 'OPERATION_COOLDOWN' }) });
    expect(host.querySelector('[data-admin-ops-operation="backup"]')?.textContent).toContain('réussie');
    await click(host.querySelector('[data-admin-ops-trigger="backup"]'));
    mounter.type(document, '[data-admin-ops-typed]', 'backup');
    await click(document.querySelector('[data-admin-ops-go="backup"]'));
    expect(document.querySelector('[data-admin-ops-error]')?.textContent).toContain('Trop tôt');
  });

  test('une demande acceptée se dit « en file » tout de suite, même avant que le relais ne la publie (#10467)', async () => {
    const { host } = await open(undefined, { trigger: () => ({ ok: true, data: { requestId: 'r9', operation: 'image-prune', status: 'queued', queuedAt: NOW.toISOString() } }) });
    expect(host.querySelector('[data-admin-ops-operation="image-prune"]')?.getAttribute('data-admin-ops-run')).toBe('none');
    await click(host.querySelector('[data-admin-ops-trigger="image-prune"]'));
    mounter.type(document, '[data-admin-ops-typed]', 'image-prune');
    await click(document.querySelector('[data-admin-ops-go="image-prune"]'));
    for (let attempt = 0; attempt < 10; attempt += 1) await mounter.settle();
    const card = host.querySelector('[data-admin-ops-operation="image-prune"]');
    expect(card?.getAttribute('data-admin-ops-run')).toBe('queued');
    expect(card?.textContent).toContain('en file');
    expect(host.querySelector<HTMLButtonElement>('[data-admin-ops-trigger="image-prune"]')?.disabled).toBe(true);
  });

  test('le « dernier passage » se lit contre l’heure du RENDU, pas celle de l’ouverture de l’écran (#10467)', async () => {
    let clock = NOW;
    const { host } = await open(undefined, { now: () => clock });
    expect(host.querySelector('[data-admin-ops-operation="backup"]')?.textContent).toContain('il y a 6 heures');
    clock = new Date(NOW.getTime() + 2 * 60 * 60 * 1000);
    await click(host.querySelector('[data-admin-ops-trigger="image-prune"]'));
    mounter.type(document, '[data-admin-ops-typed]', 'image-prune');
    await click(document.querySelector('[data-admin-ops-go="image-prune"]'));
    for (let attempt = 0; attempt < 10; attempt += 1) await mounter.settle();
    expect(host.querySelector('[data-admin-ops-operation="backup"]')?.textContent).toContain('il y a 8 heures');
  });

  test('hors du rang souverain : les graphes, aucun bouton, et la raison dite', async () => {
    const { host } = await open(adminIdentityFixture({ role: 'ADMIN' }));
    expect(host.querySelector('[data-admin-ops-trigger]')).toBeNull();
    expect(host.querySelector('[data-admin-ops-actions]')?.textContent).toContain('BIGBOSS');
  });
});
