import { describe, expect, test } from 'bun:test';

import { cooldownOf, hostSeriesOf, latestGauges, mergeSnapshot, operationRunning } from './host-metrics';
import type { HostMetricsSample, HostMetricsSnapshot } from '@meeshy/shared/types/admin-ops';

/** L'HÔTE EN DIRECT (#10396) — fusion des échantillons, séries d'une heure, jauges, délais. */
const GB = 1024 ** 3;
const sample = (at: string, over: Partial<{ cpu: number; mem: number; disk: number }> = {}): HostMetricsSample => ({
  at,
  cpu: { usedPercent: over.cpu ?? 20, cores: 8, load1: 1, load5: 0.8, load15: 0.5 },
  memory: { totalBytes: 16 * GB, availableBytes: 16 * GB - (over.mem ?? 4) * GB, usedBytes: (over.mem ?? 4) * GB },
  swap: { totalBytes: 2 * GB, usedBytes: 0 },
  disk: { mount: '/', totalBytes: 100 * GB, freeBytes: 100 * GB - (over.disk ?? 60) * GB, usedBytes: (over.disk ?? 60) * GB },
});
const snapshot = (samples: readonly HostMetricsSample[]): HostMetricsSnapshot => ({
  source: 'host-proc',
  hostname: 'meeshy',
  sharedHost: true,
  environment: 'staging',
  intervalMs: 5000,
  gpu: { kind: 'absent', reason: 'no-compute-gpu' },
  samples: [...samples],
  docker: null,
});

describe('mergeSnapshot', () => {
  test('ajoute les échantillons nouveaux, sans doublon, du plus ancien au plus récent, borné à 720', () => {
    const before = snapshot([sample('2026-10-12T10:00:00.000Z'), sample('2026-10-12T10:00:05.000Z')]);
    const merged = mergeSnapshot(before, { samples: [sample('2026-10-12T10:00:05.000Z'), sample('2026-10-12T10:00:10.000Z')] });
    expect(merged.samples.map((entry) => entry.at)).toEqual(['2026-10-12T10:00:00.000Z', '2026-10-12T10:00:05.000Z', '2026-10-12T10:00:10.000Z']);
    const many = Array.from({ length: 730 }, (_, i) => sample(new Date(Date.UTC(2026, 9, 12, 9) + i * 5000).toISOString()));
    expect(mergeSnapshot(snapshot([]), { samples: many }).samples.length).toBe(720);
  });
});

describe('hostSeriesOf / latestGauges', () => {
  test('CPU, charge, mémoire et disque en pourcentage ; la dernière mesure fait les jauges', () => {
    const snap = snapshot([sample('2026-10-12T10:00:00.000Z', { cpu: 10 }), sample('2026-10-12T10:00:05.000Z', { cpu: 30, mem: 8, disk: 75 })]);
    const series = hostSeriesOf(snap, 'fr');
    expect(series.cpu.map((point) => point.value)).toEqual([10, 30]);
    expect(series.load.map((entry) => entry.key)).toEqual(['load1', 'load5', 'load15']);
    expect(series.memory.at(-1)?.value).toBe(50);
    expect(series.disk.at(-1)?.value).toBe(75);
    expect(latestGauges(snap)).toMatchObject({ cpuPercent: 30, memoryPercent: 50, diskPercent: 75, diskFreeBytes: 25 * GB });
    expect(latestGauges(snapshot([]))).toBeNull();
  });
});

describe('cooldownOf / operationRunning', () => {
  test('le délai restant avant la prochaine opération ; nul quand elle est disponible', () => {
    const now = new Date('2026-10-12T10:00:00.000Z');
    expect(cooldownOf('2026-10-12T11:00:00.000Z', now)).toBe(3_600_000);
    expect(cooldownOf('2026-10-12T09:00:00.000Z', now)).toBe(0);
    expect(cooldownOf(null, now)).toBe(0);
  });
  test('une opération en file ou en cours est « en cours »', () => {
    expect(operationRunning({ status: 'queued' })).toBe(true);
    expect(operationRunning({ status: 'running' })).toBe(true);
    expect(operationRunning({ status: 'succeeded' })).toBe(false);
    expect(operationRunning(null)).toBe(false);
  });
});
