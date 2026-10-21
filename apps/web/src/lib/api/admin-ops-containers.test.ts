import { describe, expect, test } from 'bun:test';

import type { HttpRequest } from './http';
import { ADMIN_OPS_CONTAINERS_KEY, decodeContainersView, loadOpsContainers } from './admin-ops-containers';

const RUNNING = {
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
  stats: { cpuPercent: 3.2, memoryUsedBytes: 256, memoryLimitBytes: 2048, netRxBytes: 12, netTxBytes: 34, blockReadBytes: 0, blockWriteBytes: 41, pids: 24 },
  networks: [{ name: 'meeshy-staging-network', ipAddress: '172.20.0.5' }],
  ports: [{ containerPort: 443, protocol: 'tcp', hostIp: '0.0.0.0', hostPort: 8443 }],
};

describe('decodeContainersView — les conteneurs servis par la passerelle (#11441)', () => {
  test('rend chaque conteneur tel que servi', () => {
    const view = decodeContainersView({ environment: 'staging', measuredAt: '2026-10-21T08:00:00.000Z', containers: [RUNNING] });
    expect(view).toEqual({ environment: 'staging', measuredAt: '2026-10-21T08:00:00.000Z', containers: [RUNNING] });
  });

  test('un conteneur illisible est écarté, jamais fabriqué ; ses voisins restent', () => {
    const view = decodeContainersView({ environment: 'staging', measuredAt: null, containers: [RUNNING, { name: 'x', state: 'zombie' }, 'n’importe quoi'] });
    expect(view?.containers.map((container) => container.name)).toEqual(['meeshy-gateway-staging']);
  });

  test('un conteneur arrêté garde stats à null et ses champs facultatifs à null', () => {
    const view = decodeContainersView({ environment: 'staging', measuredAt: null, containers: [{ ...RUNNING, state: 'exited', stats: null, exitCode: 137, imageId: undefined }] });
    expect(view?.containers[0]).toMatchObject({ state: 'exited', stats: null, exitCode: 137, imageId: null });
  });

  test('une charge qui n’est pas une vue rend null', () => {
    expect(decodeContainersView(null)).toBeNull();
    expect(decodeContainersView({ containers: 'non' })).toBeNull();
  });
});

describe('loadOpsContainers', () => {
  test('lit GET /api/v1/admin/ops/containers, sous sa clé de cache', async () => {
    const calls: HttpRequest[] = [];
    const transport = Object.assign(async () => ({ ok: false as const, status: 0, error: 'x' }), {
      request: async <T,>(req: HttpRequest) => {
        calls.push(req);
        return { ok: true as const, data: { environment: 'staging', measuredAt: null, containers: [] } as T };
      },
    });
    const result = await loadOpsContainers({ source: 'gateway', transport });
    expect(calls.map((call) => [call.method, call.path])).toEqual([['GET', '/api/v1/admin/ops/containers']]);
    expect(result).toEqual({ ok: true, data: { environment: 'staging', measuredAt: null, containers: [] } });
    expect(ADMIN_OPS_CONTAINERS_KEY).toEqual(['admin', 'ops', 'containers']);
  });
});
