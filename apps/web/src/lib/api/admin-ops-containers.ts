import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import type {
  ContainerHealth,
  ContainerState,
  OpsContainer,
  OpsContainerNetwork,
  OpsContainerPort,
  OpsContainerStats,
  OpsContainersView,
} from '@meeshy/shared/types/admin-ops-containers';

import { asRecord, type AdminDeps } from './admin';
import type { ApiResult } from './http';

/**
 * **LES CONTENEURS DE L'ENVIRONNEMENT, VUS PAR L'ADMINISTRATION** (#11441) —
 * `GET admin.opsContainers` : ce que le runner de l'hôte publie chaque minute (état,
 * image et sa date, démarrage, consommation, réseaux, ports), validé par la passerelle.
 *
 * Décodeur écrit à la main (aucun Zod dans le chunk d'administration) : un conteneur
 * illisible est ÉCARTÉ, jamais complété — l'écran ne montre pas un état inventé.
 */
export const ADMIN_OPS_CONTAINERS_KEY = ['admin', 'ops', 'containers'] as const;

const STATES = ['created', 'running', 'paused', 'restarting', 'removing', 'exited', 'dead'] as const satisfies readonly ContainerState[];
const HEALTHS = ['healthy', 'unhealthy', 'starting', 'none'] as const satisfies readonly ContainerHealth[];
const ENVIRONMENTS = ['staging', 'production', 'local'] as const;

const count = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null);
const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const intOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) ? value : null);

function decodeStats(raw: unknown): OpsContainerStats | null {
  const stats = asRecord(raw);
  if (stats === null) return null;
  const n = (value: unknown): number => count(value) ?? 0;
  return {
    cpuPercent: n(stats.cpuPercent),
    memoryUsedBytes: n(stats.memoryUsedBytes),
    memoryLimitBytes: count(stats.memoryLimitBytes),
    netRxBytes: n(stats.netRxBytes),
    netTxBytes: n(stats.netTxBytes),
    blockReadBytes: n(stats.blockReadBytes),
    blockWriteBytes: n(stats.blockWriteBytes),
    pids: n(stats.pids),
  };
}

const decodeNetwork = (raw: unknown): OpsContainerNetwork | null => {
  const network = asRecord(raw);
  const name = text(network?.name);
  return name === null ? null : { name, ipAddress: typeof network?.ipAddress === 'string' ? network.ipAddress : '' };
};

const decodePort = (raw: unknown): OpsContainerPort | null => {
  const port = asRecord(raw);
  const containerPort = count(port?.containerPort);
  const protocol = port?.protocol === 'udp' || port?.protocol === 'sctp' ? port.protocol : port?.protocol === 'tcp' ? 'tcp' : null;
  if (containerPort === null || protocol === null) return null;
  return { containerPort, protocol, hostIp: text(port?.hostIp), hostPort: count(port?.hostPort) };
};

const list = <T,>(raw: unknown, decode: (item: unknown) => T | null): readonly T[] =>
  Array.isArray(raw) ? raw.map(decode).filter((item): item is T => item !== null) : [];

export function decodeContainer(raw: unknown): OpsContainer | null {
  const container = asRecord(raw);
  const name = text(container?.name);
  const image = text(container?.image);
  const state = STATES.find((candidate) => candidate === container?.state);
  if (container === null || name === null || image === null || state === undefined) return null;
  return {
    name,
    service: text(container.service),
    image,
    imageId: text(container.imageId),
    imageCreatedAt: text(container.imageCreatedAt),
    state,
    health: HEALTHS.find((candidate) => candidate === container.health) ?? 'none',
    startedAt: text(container.startedAt),
    finishedAt: text(container.finishedAt),
    restartCount: count(container.restartCount) ?? 0,
    exitCode: intOrNull(container.exitCode),
    stats: decodeStats(container.stats),
    networks: [...list(container.networks, decodeNetwork)],
    ports: [...list(container.ports, decodePort)],
  };
}

export function decodeContainersView(raw: unknown): OpsContainersView | null {
  const view = asRecord(raw);
  if (view === null || !Array.isArray(view.containers)) return null;
  return {
    environment: ENVIRONMENTS.find((env) => env === view.environment) ?? 'local',
    measuredAt: text(view.measuredAt),
    containers: list(view.containers, decodeContainer).slice(),
  };
}

export async function loadOpsContainers(params: AdminDeps & { readonly signal?: AbortSignal }): Promise<ApiResult<OpsContainersView>> {
  const result = await params.transport.request<unknown>({ method: 'GET', path: adminEndpoints.opsContainers, ...(params.signal === undefined ? {} : { signal: params.signal }) });
  if (!result.ok) return result;
  const view = decodeContainersView(result.data);
  return view === null ? { ok: false, status: 500, error: 'malformed' } : { ok: true, data: view };
}
