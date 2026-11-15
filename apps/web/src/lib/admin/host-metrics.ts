import type { HostMetricsSample, HostMetricsSnapshot, ServerOperationRun } from '@meeshy/shared/types/admin-ops';

import type { AdminLanguage } from '@/lib/i18n-admin-catalog';

/**
 * **L'HÔTE EN DIRECT, LU PAR L'ÉCRAN OPÉRATIONS** (#10396) — fonctions PURES : fusionner
 * ce qui arrive (instantané, échantillon socket, relecture `?since=`), en tirer les
 * séries d'une heure (CPU, charge 1/5/15, mémoire et swap, disque — en pourcentage, un
 * seul axe par graphe) et les jauges de la dernière mesure.
 */
export const HOST_SAMPLES_MAX = 720;

export function mergeSnapshot(
  current: HostMetricsSnapshot,
  incoming: Partial<Omit<HostMetricsSnapshot, 'samples'>> & { readonly samples: readonly HostMetricsSample[] },
): HostMetricsSnapshot {
  const byAt = new Map(current.samples.map((sample) => [sample.at, sample]));
  for (const sample of incoming.samples) byAt.set(sample.at, sample);
  const samples = [...byAt.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-HOST_SAMPLES_MAX);
  return { ...current, ...incoming, samples };
}

type Point = { readonly x: string; readonly value: number };
export type HostSeries = {
  readonly cpu: readonly Point[];
  readonly load: readonly { readonly key: 'load1' | 'load5' | 'load15'; readonly points: readonly Point[] }[];
  readonly memory: readonly Point[];
  readonly swap: readonly Point[];
  readonly disk: readonly Point[];
};

const percent = (used: number, total: number): number => (total <= 0 ? 0 : Math.round((used / total) * 1000) / 10);

const clockOf = (at: string, language: AdminLanguage): string =>
  new Date(at).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function hostSeriesOf(snapshot: HostMetricsSnapshot, language: AdminLanguage): HostSeries {
  const point = (sample: HostMetricsSample, value: number): Point => ({ x: clockOf(sample.at, language), value });
  const { samples } = snapshot;
  return {
    cpu: samples.map((sample) => point(sample, sample.cpu.usedPercent)),
    load: (['load1', 'load5', 'load15'] as const).map((key) => ({ key, points: samples.map((sample) => point(sample, sample.cpu[key])) })),
    memory: samples.map((sample) => point(sample, percent(sample.memory.usedBytes, sample.memory.totalBytes))),
    swap: samples.map((sample) => point(sample, percent(sample.swap.usedBytes, sample.swap.totalBytes))),
    disk: samples.map((sample) => point(sample, percent(sample.disk.usedBytes, sample.disk.totalBytes))),
  };
}

export type HostGauges = {
  readonly at: string;
  readonly cpuPercent: number;
  readonly cores: number;
  readonly load1: number;
  readonly memoryPercent: number;
  readonly memoryUsedBytes: number;
  readonly memoryTotalBytes: number;
  readonly swapPercent: number;
  readonly diskPercent: number;
  readonly diskFreeBytes: number;
  readonly diskTotalBytes: number;
};

export function latestGauges(snapshot: HostMetricsSnapshot): HostGauges | null {
  const last = snapshot.samples.at(-1);
  if (last === undefined) return null;
  return {
    at: last.at,
    cpuPercent: last.cpu.usedPercent,
    cores: last.cpu.cores,
    load1: last.cpu.load1,
    memoryPercent: percent(last.memory.usedBytes, last.memory.totalBytes),
    memoryUsedBytes: last.memory.usedBytes,
    memoryTotalBytes: last.memory.totalBytes,
    swapPercent: percent(last.swap.usedBytes, last.swap.totalBytes),
    diskPercent: percent(last.disk.usedBytes, last.disk.totalBytes),
    diskFreeBytes: last.disk.freeBytes,
    diskTotalBytes: last.disk.totalBytes,
  };
}

/** Le délai avant qu'une opération soit de nouveau permise, en ms — `0` quand elle l'est. */
export function cooldownOf(availableAt: string | null, now: Date): number {
  if (availableAt === null) return 0;
  const at = Date.parse(availableAt);
  return Number.isNaN(at) ? 0 : Math.max(0, at - now.getTime());
}

export function operationRunning(run: Pick<ServerOperationRun, 'status'> | null): boolean {
  return run !== null && (run.status === 'queued' || run.status === 'running');
}
