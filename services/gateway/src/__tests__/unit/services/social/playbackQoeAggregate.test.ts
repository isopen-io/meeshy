/**
 * Le temps-à-première-image et le rebuffer de chaque surface se LISENT en
 * p50/p95, par tier d'appareil et par jour (#11280) — depuis les sessions de
 * lecture que `POST /social/events` range dans `ContentEvent`
 * (`type = playback`, `props.startupMs`, `props.rebufferMs`, `props.deviceTier`).
 *
 * k-anonymat : une cellule surface × tier × jour n'est SERVIE que si au moins
 * 20 comptes distincts y ont contribué. Une ligne sans compte (anonyme, analyse
 * non consentie) nourrit la mesure mais ne compte jamais dans ce seuil.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import {
  coercePlaybackQoeRow,
  playbackQoePipeline,
  summarizePlaybackQoe,
  type PlaybackQoeRow,
} from '../../../../services/social/playbackQoeAggregate';

const accountId = (n: number): string => n.toString(16).padStart(24, '0');

const session = (overrides: Partial<PlaybackQoeRow> = {}): PlaybackQoeRow => ({
  day: 20261020,
  surface: 'reels',
  deviceTier: 'high',
  accountId: accountId(1),
  startupMs: 400,
  rebufferMs: 0,
  playedMs: 10_000,
  rebufferCount: 0,
  ...overrides,
});

const fromAccounts = (count: number, overrides: (i: number) => Partial<PlaybackQoeRow> = () => ({})): PlaybackQoeRow[] =>
  Array.from({ length: count }, (_, i) => session({ accountId: accountId(i + 1), ...overrides(i) }));

describe('summarizePlaybackQoe — quantiles par surface × tier × jour', () => {
  it('sert le p50 et le p95 du temps-à-première-image (rang le plus proche)', () => {
    const rows = fromAccounts(20, (i) => ({ startupMs: (i + 1) * 100 }));

    const { cells } = summarizePlaybackQoe(rows, { minDevices: 20 });

    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({ day: '2026-10-20', surface: 'reels', deviceTier: 'high', sessions: 20, devices: 20 });
    expect(cells[0].timeToFirstFrameMs).toEqual({ p50: 1000, p95: 1900 });
  });

  it('sert le rebuffer en durée, en part du temps de lecture, et la part des sessions qui ont rebufferisé', () => {
    const rows = fromAccounts(20, (i) => (i < 5
      ? { rebufferMs: 1000, playedMs: 9000, rebufferCount: 2 }
      : { rebufferMs: 0, playedMs: 10_000, rebufferCount: 0 }));

    const [cell] = summarizePlaybackQoe(rows, { minDevices: 20 }).cells;

    expect(cell.rebufferMs).toEqual({ p50: 0, p95: 1000 });
    expect(cell.rebufferRatio).toEqual({ p50: 0, p95: 0.1 });
    expect(cell.rebufferedRate).toBe(0.25);
  });

  it('sépare les cellules par surface, par tier et par jour', () => {
    const rows = [
      ...fromAccounts(20, () => ({ surface: 'reels', deviceTier: 'low' })),
      ...fromAccounts(20, () => ({ surface: 'reels', deviceTier: 'high' })),
      ...fromAccounts(20, () => ({ surface: 'stories', deviceTier: 'high' })),
      ...fromAccounts(20, () => ({ surface: 'stories', deviceTier: 'high', day: 20261021 })),
    ];

    const keys = summarizePlaybackQoe(rows, { minDevices: 20 }).cells.map((c) => `${c.day}|${c.surface}|${c.deviceTier}`);

    expect(keys).toEqual([
      '2026-10-20|reels|high',
      '2026-10-20|reels|low',
      '2026-10-20|stories|high',
      '2026-10-21|stories|high',
    ]);
  });

  it('range sous « unknown » une session d’un ancien client, sans tier ni surface', () => {
    const rows = fromAccounts(20, () => ({ deviceTier: undefined, surface: undefined }));

    const [cell] = summarizePlaybackQoe(rows, { minDevices: 20 }).cells;

    expect(cell).toMatchObject({ surface: 'unknown', deviceTier: 'unknown' });
  });

  it('sert null, jamais zéro, quand aucune session de la cellule ne porte la mesure', () => {
    const rows = fromAccounts(20, () => ({ startupMs: undefined, rebufferMs: undefined, playedMs: undefined, rebufferCount: undefined }));

    const [cell] = summarizePlaybackQoe(rows, { minDevices: 20 }).cells;

    expect(cell.timeToFirstFrameMs).toBeNull();
    expect(cell.rebufferMs).toBeNull();
    expect(cell.rebufferRatio).toBeNull();
    expect(cell.rebufferedRate).toBeNull();
  });
});

describe('summarizePlaybackQoe — à la taille du plafond de lecture', () => {
  it('résume 50 000 sessions d’une même cellule en temps linéaire', () => {
    const rows = Array.from({ length: 50_000 }, (_, i) => session({ accountId: accountId((i % 40) + 1), startupMs: i % 1000 }));

    const started = Date.now();
    const [cell] = summarizePlaybackQoe(rows, { minDevices: 20 }).cells;

    expect(Date.now() - started).toBeLessThan(2000);
    expect(cell).toMatchObject({ sessions: 50_000, devices: 40 });
  });
});

describe('summarizePlaybackQoe — k-anonymat (aucune ligne sous 20 appareils)', () => {
  it('retient une cellule de 19 comptes et la compte comme retenue', () => {
    const rows = fromAccounts(19);

    const summary = summarizePlaybackQoe(rows, { minDevices: 20 });

    expect(summary.cells).toEqual([]);
    expect(summary.suppressedCells).toBe(1);
  });

  it('compte les COMPTES distincts, pas les sessions : un compte qui lit 50 fois reste un', () => {
    const rows = Array.from({ length: 50 }, () => session({ accountId: accountId(7) }));

    expect(summarizePlaybackQoe(rows, { minDevices: 20 }).cells).toEqual([]);
  });

  it('une ligne sans compte nourrit la mesure mais jamais le seuil (fail-closed)', () => {
    const anonymous = Array.from({ length: 100 }, () => session({ accountId: undefined }));

    expect(summarizePlaybackQoe(anonymous, { minDevices: 20 }).cells).toEqual([]);

    const mixed = [...fromAccounts(20, () => ({ startupMs: 100 })), ...Array.from({ length: 20 }, () => session({ accountId: undefined, startupMs: 900 }))];
    const [cell] = summarizePlaybackQoe(mixed, { minDevices: 20 }).cells;
    expect(cell).toMatchObject({ sessions: 40, devices: 20 });
    expect(cell.timeToFirstFrameMs).toEqual({ p50: 100, p95: 900 });
  });

  it('ne sert aucun identifiant de compte', () => {
    const body = JSON.stringify(summarizePlaybackQoe(fromAccounts(25), { minDevices: 20 }));

    expect(body).not.toContain(accountId(1));
  });
});

describe('coercePlaybackQoeRow — la ligne rangée telle que MongoDB la rend', () => {
  it('lit le jour, la surface, le compte (JSON étendu) et les mesures de `props`', () => {
    const row = coercePlaybackQoeRow({
      day: 20261020,
      surface: 'reels',
      userId: { $oid: accountId(3) },
      props: { startupMs: 420, rebufferMs: 0, playedMs: 8000, rebufferCount: 0, deviceTier: 'mid' },
    });

    expect(row).toEqual({
      day: 20261020, surface: 'reels', deviceTier: 'mid', accountId: accountId(3),
      startupMs: 420, rebufferMs: 0, playedMs: 8000, rebufferCount: 0,
    });
  });

  it('écarte SEULE une mesure illisible, jamais la ligne ; un tier inconnu tombe', () => {
    const row = coercePlaybackQoeRow({ day: 20261020, props: { startupMs: -3, rebufferMs: 'x', deviceTier: 'ultra' } });

    expect(row).toMatchObject({ day: 20261020, startupMs: undefined, rebufferMs: undefined, deviceTier: undefined, accountId: undefined });
  });

  it('ignore le temps-à-première-image d’une session quittée avant la première image', () => {
    expect(coercePlaybackQoeRow({ day: 20261020, props: { startupMs: 900, exitBeforeStart: true } })?.startupMs).toBeUndefined();
  });

  it('rend null sans jour lisible', () => {
    expect(coercePlaybackQoeRow({ props: {} })).toBeNull();
    expect(coercePlaybackQoeRow(null)).toBeNull();
  });
});

describe('playbackQoePipeline — une lecture bornée, sur l’index type × action × jour', () => {
  it('filtre les sessions de lecture de la fenêtre, ne projette que la mesure, et borne le lot', () => {
    const pipeline = playbackQoePipeline({ sinceDay: 20261014, cap: 50_000 });

    expect(pipeline[0]).toEqual({ $match: { type: 'playback', action: 'session', day: { $gte: 20261014 } } });
    expect(pipeline).toContainEqual({ $limit: 50_000 });
    const projection = pipeline.find((stage) => '$project' in stage) as { $project: Record<string, unknown> };
    expect(Object.keys(projection.$project).sort()).toEqual([
      '_id', 'day', 'props.cls', 'props.deviceTier', 'props.exitBeforeStart', 'props.inpMs', 'props.lcpMs', 'props.longFrameWorstMs',
      'props.longFrames', 'props.longFramesBlockingMs', 'props.playedMs', 'props.rebufferCount', 'props.rebufferMs', 'props.startupMs',
      'surface', 'userId',
    ]);
  });
});

describe('les Web Vitals et les longues images de la séance (W11, #11317)', () => {
  it('coercePlaybackQoeRow lit les six mesures de `props`, et en écarte une illisible SEULE', () => {
    const row = coercePlaybackQoeRow({
      day: 20261020,
      props: { lcpMs: 1800, cls: 0.05, inpMs: 120, longFrames: 2, longFramesBlockingMs: 150, longFrameWorstMs: 90, startupMs: 'x' },
    });
    expect(row).toMatchObject({ lcpMs: 1800, cls: 0.05, inpMs: 120, longFrames: 2, longFramesBlockingMs: 150, longFrameWorstMs: 90 });
    expect(coercePlaybackQoeRow({ day: 20261020, props: { cls: -1, inpMs: 'lent' } })).toMatchObject({ cls: undefined, inpMs: undefined });
  });

  it('chaque cellule sert leur p50 et leur p95, par tier', () => {
    const rows = fromAccounts(20, (i) => ({ lcpMs: 1000 + i * 100, cls: i / 100, inpMs: 50 + i * 10, longFrames: i, longFramesBlockingMs: i * 10, longFrameWorstMs: 60 + i }));
    const [cell] = summarizePlaybackQoe(rows, { minDevices: 20 }).cells;
    expect(cell).toMatchObject({
      deviceTier: 'high',
      lcpMs: { p50: 1900, p95: 2800 },
      cls: { p50: 0.09, p95: 0.18 },
      inpMs: { p50: 140, p95: 230 },
      longFrames: { p50: 9, p95: 18 },
      longFramesBlockingMs: { p50: 90, p95: 180 },
      longFrameWorstMs: { p50: 69, p95: 78 },
    });
  });

  it('sert null, jamais zéro, quand aucune séance de la cellule ne les porte (client natif, ancien web)', () => {
    const [cell] = summarizePlaybackQoe(fromAccounts(20), { minDevices: 20 }).cells;
    expect(cell).toMatchObject({ lcpMs: null, cls: null, inpMs: null, longFrames: null, longFramesBlockingMs: null, longFrameWorstMs: null });
  });
});

