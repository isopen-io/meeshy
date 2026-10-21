/**
 * LA SONDE DE L'HÔTE (#10384) — mémoire, CPU, charge, swap et disque de la
 * machine, échantillonnés toutes les cinq secondes et gardés une heure.
 *
 * Elle lit `/proc/stat`, `/proc/meminfo`, `/proc/loadavg` et `statfs` sur
 * `HOST_DISK_PROBE_PATH` (`/` par défaut). Dans un conteneur Docker, ces trois
 * fichiers de `/proc` ne sont pas isolés : ils disent l'HÔTE, ce que l'écran
 * d'administration veut voir pour décider d'une purge. Quand le conteneur est
 * borné par son cgroup (`memory.max` ≠ `max`), l'instantané le dit
 * (`source: 'container-cgroup'`), parce que la mémoire de l'hôte n'est alors pas
 * celle dont le service dispose.
 *
 * Toutes les lectures passent par un `HostReader` injecté : aucune sonde ne
 * touche le système de fichiers dans un témoin. Une lecture qui échoue ne
 * fabrique AUCUN échantillon — jamais un faux zéro.
 */
import { access, readFile, statfs } from 'node:fs/promises';
import { hostname as osHostname } from 'node:os';
import {
  HOST_METRICS_BUFFER_SIZE,
  HOST_METRICS_SAMPLE_INTERVAL_MS,
  type DockerUsage,
  type HostGpu,
  type HostMetricsSample,
  type HostMetricsSnapshot,
} from '@meeshy/shared/types/admin-ops';
import { readDockerUsage, readOpsSettings, type OpsEnv } from './ops-relay';
import { logger } from '../../utils/logger';
import { guardedInterval } from '../../utils/guarded-timer';

export type HostStatfs = { readonly blocks: number; readonly bsize: number; readonly bfree: number; readonly bavail: number };

export type HostReader = {
  readonly readText: (path: string) => Promise<string | null>;
  readonly exists: (path: string) => Promise<boolean>;
  readonly statfs: (path: string) => Promise<HostStatfs | null>;
};

export type ProcStat = { readonly idle: number; readonly total: number; readonly cores: number };
export type Meminfo = {
  readonly totalBytes: number;
  readonly availableBytes: number;
  readonly swapTotalBytes: number;
  readonly swapFreeBytes: number;
};
export type Loadavg = { readonly load1: number; readonly load5: number; readonly load15: number };

const NVIDIA_DEVICE = '/dev/nvidia0';
const NVIDIA_DRIVER = '/proc/driver/nvidia/gpus';
const CGROUP_MEMORY_MAX = '/sys/fs/cgroup/memory.max';

export function parseProcStat(text: string): ProcStat | null {
  const lines = text.split('\n');
  const aggregate = lines.find((line) => /^cpu\s/.test(line));
  if (!aggregate) return null;
  const fields = aggregate.trim().split(/\s+/).slice(1, 9).map(Number);
  if (fields.length < 4 || fields.some((value) => !Number.isFinite(value))) return null;
  const [user, nice, system, idle, iowait = 0, irq = 0, softirq = 0, steal = 0] = fields;
  const cores = lines.filter((line) => /^cpu\d+\s/.test(line)).length;
  return {
    idle: idle + iowait,
    total: user + nice + system + idle + iowait + irq + softirq + steal,
    cores: Math.max(cores, 1),
  };
}

export function parseMeminfo(text: string): Meminfo | null {
  const kib = (key: string): number | null => {
    const match = new RegExp(`^${key}:\\s+(\\d+)\\s*kB`, 'm').exec(text);
    return match ? Number(match[1]) * 1024 : null;
  };
  const totalBytes = kib('MemTotal');
  const availableBytes = kib('MemAvailable');
  if (totalBytes === null || availableBytes === null) return null;
  return {
    totalBytes,
    availableBytes,
    swapTotalBytes: kib('SwapTotal') ?? 0,
    swapFreeBytes: kib('SwapFree') ?? 0,
  };
}

export function parseLoadavg(text: string): Loadavg | null {
  const [load1, load5, load15] = text.trim().split(/\s+/).slice(0, 3).map(Number);
  if (![load1, load5, load15].every((value) => Number.isFinite(value) && value >= 0)) return null;
  return { load1, load5, load15 };
}

const clampPercent = (value: number): number => Math.min(100, Math.max(0, Math.round(value * 10) / 10));

function cpuUsedPercent(previous: ProcStat | null, next: ProcStat): number {
  if (!previous || next.total <= previous.total) {
    return next.total > 0 ? clampPercent(100 * (1 - next.idle / next.total)) : 0;
  }
  const deltaTotal = next.total - previous.total;
  const deltaIdle = Math.max(0, next.idle - previous.idle);
  return clampPercent(100 * (1 - deltaIdle / deltaTotal));
}

const nonNegativeInt = (value: number): number => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

export type HostMetricsProbeOptions = {
  readonly reader: HostReader;
  readonly env: OpsEnv;
  readonly hostname: () => string;
  readonly now: () => Date;
  readonly readDockerUsage: () => Promise<DockerUsage | null>;
  readonly intervalMs?: number;
  readonly bufferSize?: number;
};

export type HostMetricsProbe = {
  readonly start: () => void;
  readonly stop: () => void;
  readonly prime: () => Promise<void>;
  readonly tick: () => Promise<HostMetricsSample | null>;
  readonly snapshot: (since?: Date) => Promise<HostMetricsSnapshot>;
  readonly onSample: (listener: (sample: HostMetricsSample) => void) => () => void;
};

export function createHostMetricsProbe(options: HostMetricsProbeOptions): HostMetricsProbe {
  const intervalMs = options.intervalMs ?? HOST_METRICS_SAMPLE_INTERVAL_MS;
  const bufferSize = options.bufferSize ?? HOST_METRICS_BUFFER_SIZE;
  const settings = readOpsSettings(options.env);
  const listeners = new Set<(sample: HostMetricsSample) => void>();
  let samples: readonly HostMetricsSample[] = [];
  let previousStat: ProcStat | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const readStat = async (): Promise<ProcStat | null> => {
    const text = await options.reader.readText('/proc/stat');
    return text === null ? null : parseProcStat(text);
  };

  const prime = async (): Promise<void> => {
    previousStat = await readStat();
  };

  const measure = async (): Promise<HostMetricsSample | null> => {
    const [stat, meminfoText, loadText, disk] = await Promise.all([
      readStat(),
      options.reader.readText('/proc/meminfo'),
      options.reader.readText('/proc/loadavg'),
      options.reader.statfs(settings.diskProbePath),
    ]);
    const memory = meminfoText === null ? null : parseMeminfo(meminfoText);
    const load = loadText === null ? null : parseLoadavg(loadText);
    if (!stat || !memory || !load || !disk) return null;
    const usedPercent = cpuUsedPercent(previousStat, stat);
    previousStat = stat;
    const totalBytes = nonNegativeInt(disk.blocks * disk.bsize);
    return {
      at: options.now().toISOString(),
      cpu: { usedPercent, cores: stat.cores, ...load },
      memory: {
        totalBytes: nonNegativeInt(memory.totalBytes),
        availableBytes: nonNegativeInt(memory.availableBytes),
        usedBytes: nonNegativeInt(memory.totalBytes - memory.availableBytes),
      },
      swap: {
        totalBytes: nonNegativeInt(memory.swapTotalBytes),
        usedBytes: nonNegativeInt(memory.swapTotalBytes - memory.swapFreeBytes),
      },
      disk: {
        mount: settings.diskProbePath,
        totalBytes,
        freeBytes: nonNegativeInt(disk.bavail * disk.bsize),
        usedBytes: nonNegativeInt((disk.blocks - disk.bfree) * disk.bsize),
      },
    };
  };

  const tick = async (): Promise<HostMetricsSample | null> => {
    const sample = await measure().catch(() => null);
    if (!sample) return null;
    samples = [...samples, sample].slice(-bufferSize);
    listeners.forEach((listener) => {
      try {
        listener(sample);
      } catch {
        // Un abonné défaillant ne prive pas les autres de l'échantillon.
      }
    });
    return sample;
  };

  const detectGpu = async (): Promise<HostGpu> => {
    const [device, driver] = await Promise.all([
      options.reader.exists(NVIDIA_DEVICE),
      options.reader.exists(NVIDIA_DRIVER),
    ]);
    if (!device && !driver) return { kind: 'absent', reason: 'no-compute-gpu' };
    return { kind: 'present', name: 'NVIDIA', usedPercent: null, memoryUsedBytes: null, memoryTotalBytes: null };
  };

  const detectSource = async (): Promise<HostMetricsSnapshot['source']> => {
    const limit = (await options.reader.readText(CGROUP_MEMORY_MAX))?.trim();
    return limit && limit !== 'max' ? 'container-cgroup' : 'host-proc';
  };

  const snapshot = async (since?: Date): Promise<HostMetricsSnapshot> => {
    const [gpu, source, docker] = await Promise.all([
      detectGpu(),
      detectSource(),
      options.readDockerUsage().catch(() => null),
    ]);
    const after = since?.getTime();
    return {
      source,
      hostname: options.hostname(),
      sharedHost: settings.sharedHost,
      environment: settings.environment,
      intervalMs,
      gpu,
      samples: after === undefined ? [...samples] : samples.filter((sample) => Date.parse(sample.at) > after),
      docker,
    };
  };

  const start = (): void => {
    if (timer) return;
    prime().catch(() => undefined);
    timer = guardedInterval({ name: 'host-metrics-probe', everyMs: intervalMs, logger, run: () => tick().catch(() => undefined) });
    timer.unref?.();
  };

  const stop = (): void => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  const onSample = (listener: (sample: HostMetricsSample) => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return { start, stop, prime, tick, snapshot, onSample };
}

export const fsHostReader: HostReader = {
  readText: (path) => readFile(path, 'utf8').catch(() => null),
  exists: (path) => access(path).then(() => true, () => false),
  statfs: (path) =>
    statfs(path).then(
      (stats) => ({ blocks: Number(stats.blocks), bsize: Number(stats.bsize), bfree: Number(stats.bfree), bavail: Number(stats.bavail) }),
      () => null,
    ),
};

let sharedProbe: HostMetricsProbe | null = null;

/** La sonde unique du processus, branchée sur le vrai système de fichiers. */
export function hostMetricsProbe(): HostMetricsProbe {
  if (!sharedProbe) {
    const env = process.env;
    sharedProbe = createHostMetricsProbe({
      reader: fsHostReader,
      env,
      hostname: osHostname,
      now: () => new Date(),
      readDockerUsage: () => readDockerUsage(readOpsSettings(env).stateDir),
    });
  }
  return sharedProbe;
}
