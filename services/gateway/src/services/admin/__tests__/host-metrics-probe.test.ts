/**
 * La sonde de l'hôte (#10384) : ce qu'elle lit de /proc et du disque, comment
 * elle calcule le CPU entre deux lectures, ce qu'elle garde (720 points) et ce
 * qu'elle dit du GPU quand il n'y en a pas.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { hostMetricsSnapshotSchema } from '@meeshy/shared/types/admin-ops';
import {
  createHostMetricsProbe,
  parseLoadavg,
  parseMeminfo,
  parseProcStat,
  type HostReader,
} from '../host-metrics-probe';

const STAT_A = [
  'cpu  1000 0 500 8000 500 0 0 0 0 0',
  'cpu0 500 0 250 4000 250 0 0 0 0 0',
  'cpu1 500 0 250 4000 250 0 0 0 0 0',
  'intr 1',
].join('\n');
const STAT_B = [
  'cpu  1300 0 700 8400 600 0 0 0 0 0',
  'cpu0 650 0 350 4200 300 0 0 0 0 0',
  'cpu1 650 0 350 4200 300 0 0 0 0 0',
].join('\n');
const MEMINFO = [
  'MemTotal:       16000000 kB',
  'MemFree:         1000000 kB',
  'MemAvailable:    6000000 kB',
  'SwapTotal:       2000000 kB',
  'SwapFree:        1500000 kB',
].join('\n');
const LOADAVG = '0.52 0.41 0.30 2/900 12345';

type Files = Record<string, string>;

function reader(files: Files, statSequence: string[] = [STAT_A, STAT_B, STAT_B]): HostReader & { readonly stats: string[] } {
  const stats = [...statSequence];
  return {
    stats,
    readText: async (path: string) => {
      if (path === '/proc/stat') return stats.length > 1 ? stats.shift() ?? null : stats[0] ?? null;
      return files[path] ?? null;
    },
    exists: async (path: string) => path in files,
    statfs: async () => ({ blocks: 1000, bsize: 4096, bfree: 400, bavail: 350 }),
  };
}

const BASE_FILES: Files = {
  '/proc/meminfo': MEMINFO,
  '/proc/loadavg': LOADAVG,
  '/sys/fs/cgroup/memory.max': 'max\n',
};

const clock = (start = Date.parse('2026-10-12T22:00:00.000Z')) => {
  let now = start;
  return { now: () => new Date(now), advance: (ms: number) => { now += ms; } };
};

const env = { OPS_ENVIRONMENT: 'staging', OPS_SHARED_HOST: 'true' };

function probe(files: Files = BASE_FILES, extra: { bufferSize?: number; docker?: unknown } = {}) {
  const c = clock();
  const r = reader(files);
  const p = createHostMetricsProbe({
    reader: r,
    env,
    hostname: () => 'meeshy-host',
    now: c.now,
    bufferSize: extra.bufferSize,
    readDockerUsage: async () => (extra.docker ?? null) as never,
  });
  return { p, c, r };
}

describe('lecture de /proc', () => {
  it('compte les cœurs et sépare l’inactivité (idle + iowait) du total', () => {
    expect(parseProcStat(STAT_A)).toEqual({ idle: 8500, total: 10000, cores: 2 });
    expect(parseProcStat('garbage')).toBeNull();
  });

  it('rend la mémoire et le swap en octets', () => {
    expect(parseMeminfo(MEMINFO)).toEqual({
      totalBytes: 16_000_000 * 1024,
      availableBytes: 6_000_000 * 1024,
      swapTotalBytes: 2_000_000 * 1024,
      swapFreeBytes: 1_500_000 * 1024,
    });
    expect(parseMeminfo('MemTotal: 1 kB')).toBeNull();
  });

  it('rend les trois charges', () => {
    expect(parseLoadavg(LOADAVG)).toEqual({ load1: 0.52, load5: 0.41, load15: 0.3 });
    expect(parseLoadavg('')).toBeNull();
  });
});

describe('createHostMetricsProbe', () => {
  it('calcule le CPU sur l’écart entre deux lectures', async () => {
    const { p } = probe();
    await p.prime();
    const sample = await p.tick();
    // Δtotal = 1000, Δidle = 500 ⇒ 50 %
    expect(sample?.cpu).toEqual({ usedPercent: 50, cores: 2, load1: 0.52, load5: 0.41, load15: 0.3 });
    expect(sample?.memory).toEqual({
      totalBytes: 16_000_000 * 1024,
      availableBytes: 6_000_000 * 1024,
      usedBytes: 10_000_000 * 1024,
    });
    expect(sample?.swap).toEqual({ totalBytes: 2_000_000 * 1024, usedBytes: 500_000 * 1024 });
    expect(sample?.disk).toEqual({ mount: '/', totalBytes: 1000 * 4096, freeBytes: 350 * 4096, usedBytes: 600 * 4096 });
  });

  it('ne fabrique aucun échantillon quand /proc est illisible', async () => {
    const c = clock();
    const p = createHostMetricsProbe({
      reader: { readText: async () => null, exists: async () => false, statfs: async () => null },
      env,
      hostname: () => 'h',
      now: c.now,
      readDockerUsage: async () => null,
    });
    await p.prime();
    expect(await p.tick()).toBeNull();
    expect((await p.snapshot()).samples).toEqual([]);
  });

  it('garde au plus bufferSize points, du plus ancien au plus récent', async () => {
    const { p, c } = probe(BASE_FILES, { bufferSize: 3 });
    await p.prime();
    for (let i = 0; i < 5; i += 1) {
      c.advance(5000);
      await p.tick();
    }
    const { samples } = await p.snapshot();
    expect(samples).toHaveLength(3);
    expect(samples.map((s) => s.at)).toEqual([
      '2026-10-12T22:00:15.000Z',
      '2026-10-12T22:00:20.000Z',
      '2026-10-12T22:00:25.000Z',
    ]);
  });

  it('ne rend que les points postérieurs à since', async () => {
    const { p, c } = probe();
    await p.prime();
    c.advance(5000);
    await p.tick();
    c.advance(5000);
    await p.tick();
    const { samples } = await p.snapshot(new Date('2026-10-12T22:00:05.000Z'));
    expect(samples.map((s) => s.at)).toEqual(['2026-10-12T22:00:10.000Z']);
  });

  it('dit « aucun GPU de calcul » sans /dev/nvidia0 ni pilote, et un instantané conforme au contrat', async () => {
    const { p } = probe();
    await p.prime();
    await p.tick();
    const snapshot = await p.snapshot();
    expect(snapshot.gpu).toEqual({ kind: 'absent', reason: 'no-compute-gpu' });
    expect(snapshot.source).toBe('host-proc');
    expect(snapshot.hostname).toBe('meeshy-host');
    expect(snapshot.sharedHost).toBe(true);
    expect(snapshot.environment).toBe('staging');
    expect(snapshot.intervalMs).toBe(5000);
    expect(snapshot.docker).toBeNull();
    expect(hostMetricsSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it('nomme un GPU présent par son pilote', async () => {
    const { p } = probe({ ...BASE_FILES, '/dev/nvidia0': '', '/proc/driver/nvidia/gpus': '' });
    expect((await p.snapshot()).gpu).toEqual({
      kind: 'present',
      name: 'NVIDIA',
      usedPercent: null,
      memoryUsedBytes: null,
      memoryTotalBytes: null,
    });
  });

  it('se dit limité par le cgroup quand memory.max est borné', async () => {
    const { p } = probe({ ...BASE_FILES, '/sys/fs/cgroup/memory.max': '2147483648\n' });
    expect((await p.snapshot()).source).toBe('container-cgroup');
  });

  it('prévient ses abonnés à chaque échantillon, et plus après désabonnement', async () => {
    const { p } = probe();
    await p.prime();
    const listener = jest.fn();
    const off = p.onSample(listener);
    await p.tick();
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    await p.tick();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('un abonné qui lève ne prive pas les autres', async () => {
    const { p } = probe();
    await p.prime();
    const second = jest.fn();
    p.onSample(() => { throw new Error('boom'); });
    p.onSample(second);
    await p.tick();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('démarre une seule minuterie, qui ne retient pas le processus', async () => {
    jest.useFakeTimers();
    try {
      const { p } = probe();
      const unref = jest.fn();
      const spy = jest.spyOn(global, 'setInterval').mockImplementation(((() => ({ unref })) as unknown) as typeof setInterval);
      p.start();
      p.start();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(unref).toHaveBeenCalledTimes(1);
      spy.mockRestore();
      p.stop();
    } finally {
      jest.useRealTimers();
    }
  });
});
