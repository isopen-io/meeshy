import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import type {
  DockerUsage,
  HostGpu,
  HostMetricsSample,
  HostMetricsSnapshot,
  ServerOperation,
  ServerOperationRun,
  ServerOperationStatus,
  ServerOperationWindowView,
} from '@meeshy/shared/types/admin-ops';

import { asRecord, type AdminDeps } from './admin';
import { decodeBackups, type AdminBackups } from './admin-monitoring';
import type { ApiResult } from './http';

/**
 * **LES OPÉRATIONS DU SERVEUR, VUES PAR L'ADMINISTRATION** (#10396) — `GET admin.opsHostMetrics`
 * (l'hôte échantillonné toutes les 5 s, une heure ; `?since=` ne rend que les points
 * postérieurs), `GET admin.opsStatus` (le dernier passage de chaque opération, sa prochaine
 * disponibilité, sa fenêtre horaire, le relais, la dernière sauvegarde) et `POST
 * admin.opsByOperation` (rang d'administration, confirmation qui nomme l'opération).
 * La fenêtre (#11452) se lit telle que la passerelle la sert : une passerelle qui ne la
 * connaît pas encore rend `null`, et l'écran n'en dit rien.
 *
 * Décodeurs écrits à la main (aucun Zod dans le chunk d'administration) : une charge
 * illisible ne fabrique AUCUN chiffre — l'échantillon est écarté, l'instantané rend `null`.
 */
export const SERVER_OPERATIONS_SHOWN = ['backup', 'image-prune'] as const satisfies readonly ServerOperation[];

export const ADMIN_OPS_METRICS_KEY = ['admin', 'ops', 'metrics'] as const;
export const ADMIN_OPS_STATUS_KEY = ['admin', 'ops', 'status'] as const;

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null);
const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

export function decodeHostSample(raw: unknown): HostMetricsSample | null {
  const sample = asRecord(raw);
  const cpu = asRecord(sample?.cpu);
  const memory = asRecord(sample?.memory);
  const swap = asRecord(sample?.swap);
  const disk = asRecord(sample?.disk);
  const at = text(sample?.at);
  if (at === null || cpu === null || memory === null || swap === null || disk === null) return null;
  const fields = {
    usedPercent: num(cpu.usedPercent),
    cores: num(cpu.cores),
    load1: num(cpu.load1),
    load5: num(cpu.load5),
    load15: num(cpu.load15),
    memTotal: num(memory.totalBytes),
    memAvailable: num(memory.availableBytes),
    memUsed: num(memory.usedBytes),
    swapTotal: num(swap.totalBytes),
    swapUsed: num(swap.usedBytes),
    diskTotal: num(disk.totalBytes),
    diskFree: num(disk.freeBytes),
    diskUsed: num(disk.usedBytes),
  };
  if (Object.values(fields).some((value) => value === null)) return null;
  const f = fields as { readonly [K in keyof typeof fields]: number };
  return {
    at,
    cpu: { usedPercent: Math.min(100, f.usedPercent), cores: Math.max(1, f.cores), load1: f.load1, load5: f.load5, load15: f.load15 },
    memory: { totalBytes: f.memTotal, availableBytes: f.memAvailable, usedBytes: f.memUsed },
    swap: { totalBytes: f.swapTotal, usedBytes: f.swapUsed },
    disk: { mount: text(disk.mount) ?? '/', totalBytes: f.diskTotal, freeBytes: f.diskFree, usedBytes: f.diskUsed },
  };
}

function decodeGpu(raw: unknown): HostGpu {
  const gpu = asRecord(raw);
  if (gpu?.kind === 'present') {
    return { kind: 'present', name: text(gpu.name) ?? '', usedPercent: num(gpu.usedPercent), memoryUsedBytes: num(gpu.memoryUsedBytes), memoryTotalBytes: num(gpu.memoryTotalBytes) };
  }
  return { kind: 'absent', reason: gpu?.reason === 'not-visible-from-container' ? 'not-visible-from-container' : 'no-compute-gpu' };
}

function decodeDocker(raw: unknown): DockerUsage | null {
  const docker = asRecord(raw);
  const images = asRecord(docker?.images);
  const cache = asRecord(docker?.buildCache);
  const volumes = asRecord(docker?.volumes);
  const measuredAt = text(docker?.measuredAt);
  if (measuredAt === null || images === null || cache === null || volumes === null) return null;
  const n = (value: unknown): number => num(value) ?? 0;
  return {
    measuredAt,
    images: { count: n(images.count), activeCount: n(images.activeCount), totalBytes: n(images.totalBytes), reclaimableBytes: n(images.reclaimableBytes) },
    buildCache: { totalBytes: n(cache.totalBytes), reclaimableBytes: n(cache.reclaimableBytes) },
    volumes: { count: n(volumes.count), totalBytes: n(volumes.totalBytes), reclaimableBytes: n(volumes.reclaimableBytes) },
  };
}

const ENVIRONMENTS = ['staging', 'production', 'local'] as const;

export function decodeHostSnapshot(raw: unknown): HostMetricsSnapshot | null {
  const snapshot = asRecord(raw);
  if (snapshot === null || !Array.isArray(snapshot.samples)) return null;
  return {
    source: snapshot.source === 'container-cgroup' ? 'container-cgroup' : 'host-proc',
    hostname: text(snapshot.hostname) ?? '',
    sharedHost: snapshot.sharedHost === true,
    environment: ENVIRONMENTS.find((env) => env === snapshot.environment) ?? 'local',
    intervalMs: num(snapshot.intervalMs) ?? 5000,
    gpu: decodeGpu(snapshot.gpu),
    samples: snapshot.samples.map(decodeHostSample).filter((sample): sample is HostMetricsSample => sample !== null),
    docker: decodeDocker(snapshot.docker),
  };
}

const STATUSES = ['queued', 'running', 'succeeded', 'failed', 'rejected', 'throttled'] as const;

function decodeRun(raw: unknown, operation: ServerOperation): ServerOperationRun | null {
  const run = asRecord(raw);
  const status = STATUSES.find((candidate) => candidate === run?.status);
  if (run === null || status === undefined) return null;
  return {
    requestId: text(run.requestId) ?? '',
    operation,
    status,
    requestedBy: text(run.requestedBy) ?? '',
    requestedAt: text(run.requestedAt) ?? '',
    startedAt: text(run.startedAt),
    finishedAt: text(run.finishedAt),
    reclaimedBytes: num(run.reclaimedBytes),
    code: text(run.code),
  };
}

/** La fenêtre horaire servie (#11452), ou `null` : sans fenêtre, ou illisible. */
function decodeWindow(raw: unknown): ServerOperationWindowView | null {
  const served = asRecord(raw);
  const hour = (value: unknown, max: number): number | null => (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max ? value : null);
  const startHour = hour(served?.startHour, 23);
  const endHour = hour(served?.endHour, 24);
  if (served?.timeZone !== 'Europe/Paris' || startHour === null || endHour === null || typeof served.open !== 'boolean') return null;
  return { timeZone: 'Europe/Paris', startHour, endHour, open: served.open };
}

export type AdminOpsStatus = ServerOperationStatus & { readonly backup: AdminBackups | null };

export function decodeOpsStatus(raw: unknown): AdminOpsStatus | null {
  const status = asRecord(raw);
  if (status === null) return null;
  const runs = asRecord(status.runs);
  const availableAt = asRecord(status.availableAt);
  const windows = asRecord(status.windows);
  const entries = <T,>(of: (op: ServerOperation) => T) => Object.fromEntries(SERVER_OPERATIONS_SHOWN.map((op) => [op, of(op)])) as Record<ServerOperation, T>;
  return {
    environment: ENVIRONMENTS.find((env) => env === status.environment) ?? 'local',
    relayInstalled: status.relayInstalled === true,
    runs: entries((op) => decodeRun(runs?.[op], op)),
    availableAt: entries((op) => text(availableAt?.[op])),
    windows: entries((op) => decodeWindow(windows?.[op])),
    backup: decodeBackups(status.backup),
  };
}

export async function loadHostMetrics(params: AdminDeps & { readonly since?: string; readonly signal?: AbortSignal }): Promise<ApiResult<HostMetricsSnapshot>> {
  const query = params.since === undefined ? '' : `?${new URLSearchParams({ since: params.since }).toString()}`;
  const result = await params.transport.request<unknown>({ method: 'GET', path: `${adminEndpoints.opsHostMetrics}${query}`, ...(params.signal === undefined ? {} : { signal: params.signal }) });
  if (!result.ok) return result;
  const snapshot = decodeHostSnapshot(result.data);
  return snapshot === null ? { ok: false, status: 500, error: 'malformed' } : { ok: true, data: snapshot };
}

export async function loadOpsStatus(params: AdminDeps & { readonly signal?: AbortSignal }): Promise<ApiResult<AdminOpsStatus>> {
  const result = await params.transport.request<unknown>({ method: 'GET', path: adminEndpoints.opsStatus, ...(params.signal === undefined ? {} : { signal: params.signal }) });
  if (!result.ok) return result;
  const status = decodeOpsStatus(result.data);
  return status === null ? { ok: false, status: 500, error: 'malformed' } : { ok: true, data: status };
}

export type AdminOpsAccepted = { readonly requestId: string; readonly operation: ServerOperation; readonly queuedAt: string | null };

export async function triggerServerOperation(
  params: AdminDeps & { readonly operation: ServerOperation; readonly reason?: string | null },
): Promise<ApiResult<AdminOpsAccepted>> {
  const result = await params.transport.request<unknown>({
    method: 'POST',
    path: adminEndpoints.opsByOperation(params.operation),
    body: { confirm: params.operation, ...(params.reason === null || params.reason === undefined || params.reason.trim() === '' ? {} : { reason: params.reason.trim() }) },
  });
  if (!result.ok) return result;
  const data = asRecord(result.data);
  return { ok: true, data: { requestId: text(data?.requestId) ?? '', operation: params.operation, queuedAt: text(data?.queuedAt) } };
}
