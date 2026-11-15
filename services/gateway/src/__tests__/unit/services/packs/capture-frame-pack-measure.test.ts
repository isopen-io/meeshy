/**
 * LA MESURE QUE LC2 ATTEND (#10169, #10187) — combien de comptes ont retiré ou
 * réinstallé chaque ambiance de cadres de capture : une requête d'administration
 * en LECTURE SEULE, agrégée par slug et par état, SANS AUCUN identifiant de
 * compte en sortie, cellules de moins de 5 comptes supprimées.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';

import {
  CAPTURE_FRAME_MEASURE_MIN_ACCOUNTS,
  measureCaptureFramePacks,
  readCaptureFramePackMeasure,
  type CaptureFramePackChoiceRow,
} from '../../../../services/packs/captureFramePackMeasure';

const AT = new Date('2026-10-25T09:00:00.000Z');
const account = (n: number): string => `68b0000000000000000${String(n).padStart(5, '0')}`;

const removed = (slug: string, accounts: number, from = 0): readonly CaptureFramePackChoiceRow[] =>
  Array.from({ length: accounts }, (_, index) => ({ userId: account(from + index), packSlug: `capture-frame.${slug}`, installedAt: null }));
const reinstalled = (slug: string, accounts: number, from = 0): readonly CaptureFramePackChoiceRow[] =>
  Array.from({ length: accounts }, (_, index) => ({ userId: account(from + index), packSlug: `capture-frame.${slug}`, installedAt: AT }));

describe('measureCaptureFramePacks — l’agrégat', () => {
  it('compte les comptes DISTINCTS par ambiance et par état, dans l’ordre du slug puis de l’état', () => {
    const report = measureCaptureFramePacks([...removed('jovial', 6), ...reinstalled('jovial', 5, 100), ...removed('morbide', 7, 200)]);
    expect(report.cells).toEqual([
      { slug: 'jovial', state: 'removed', accounts: 6 },
      { slug: 'jovial', state: 'reinstalled', accounts: 5 },
      { slug: 'morbide', state: 'removed', accounts: 7 },
    ]);
    expect(report.suppressedCells).toBe(0);
  });

  it('une cellule de 4 comptes n’apparaît pas ; elle se compte parmi les cellules supprimées', () => {
    const report = measureCaptureFramePacks([...removed('jovial', CAPTURE_FRAME_MEASURE_MIN_ACCOUNTS - 1), ...removed('morbide', CAPTURE_FRAME_MEASURE_MIN_ACCOUNTS, 50)]);
    expect(report.cells).toEqual([{ slug: 'morbide', state: 'removed', accounts: CAPTURE_FRAME_MEASURE_MIN_ACCOUNTS }]);
    expect(report.suppressedCells).toBe(1);
  });

  it('aucun identifiant de compte ne sort, ni en clé ni en valeur', () => {
    const rows = [...removed('jovial', 9), ...reinstalled('elegant', 8, 300)];
    const printed = JSON.stringify(measureCaptureFramePacks(rows));
    for (const row of rows) expect(printed).not.toContain(row.userId);
    expect(printed).not.toMatch(/[0-9a-f]{24}/);
  });

  it('ignore les choix d’un autre domaine (stickers, cadres de gloire) et les clés illisibles', () => {
    const others: readonly CaptureFramePackChoiceRow[] = [
      ...Array.from({ length: 6 }, (_, index) => ({ userId: account(index), packSlug: 'mee', installedAt: null })),
      ...Array.from({ length: 6 }, (_, index) => ({ userId: account(index), packSlug: 'glory-frame.afrique', installedAt: null })),
      ...Array.from({ length: 6 }, (_, index) => ({ userId: account(index), packSlug: 'capture-frame.Pas Un Slug', installedAt: null })),
    ];
    expect(measureCaptureFramePacks(others)).toEqual({ cells: [], suppressedCells: 0, accounts: null });
  });

  it('dit combien de comptes distincts ont touché au moins une ambiance — un total, jamais une liste, retenu lui aussi sous le seuil', () => {
    expect(measureCaptureFramePacks([...removed('jovial', 6), ...removed('morbide', 6)]).accounts).toBe(6);
    expect(measureCaptureFramePacks(removed('jovial', CAPTURE_FRAME_MEASURE_MIN_ACCOUNTS - 1)).accounts).toBeNull();
  });
});

describe('readCaptureFramePackMeasure — une requête en lecture seule', () => {
  it('ne lit que les choix `capture-frame.*`, par un seul findMany, sans rien écrire', async () => {
    const calls: unknown[] = [];
    const forbidden = () => {
      throw new Error('écriture interdite');
    };
    const prisma = {
      userStickerPack: {
        findMany: async (args: unknown) => {
          calls.push(args);
          return removed('jovial', 5);
        },
        update: forbidden,
        updateMany: forbidden,
        create: forbidden,
        upsert: forbidden,
        delete: forbidden,
        deleteMany: forbidden,
      },
    };
    const report = await readCaptureFramePackMeasure(prisma);
    expect(calls).toEqual([{ where: { packSlug: { gte: 'capture-frame.', lt: 'capture-frame/' } }, select: { userId: true, packSlug: true, installedAt: true } }]);
    expect(report.cells).toEqual([{ slug: 'jovial', state: 'removed', accounts: 5 }]);
  });
});
