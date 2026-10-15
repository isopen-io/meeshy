/**
 * UN NOMBRE RELU D'UNE COMMANDE BRUTE SE DÉCODE SOUS TOUTES SES FORMES (#10541).
 *
 * Mesuré en production le 2026-10-13 : sur 675 lignes `EngagementCounter`, 616
 * portent `points` ET `count` en `long` (Int64) — le `Long` est la NORME. Un
 * lecteur qui n'accepte que `typeof === 'number'` lirait zéro dès que la
 * commande rend la forme canonique `{ $numberLong: "…" }` : la reprise ne
 * rendrait rien, le crédit annoncerait un compte d'actions à zéro, et le
 * palier d'un score se calculerait sur `undefined`.
 *
 * Mesuré le 2026-10-13 sur un MongoDB 8.0.4 jetable, lignes semées en
 * `NumberLong` : le client Prisma du dépôt rend ces valeurs en nombres NUS
 * (EJSON relâché). Ces témoins gardent l'autre forme, que rien n'interdit à une
 * version voisine du client ou du serveur de rendre.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { rawCommandNumber } from '../rawCommandNumber';
import {
  creditEngagementCounter,
  debitEngagementCounter,
  takeBackFromEngagementCounter,
  type EngagementCounterDb,
} from '../EngagementCounterWrites';

const FORMS = [
  { name: 'un nombre nu', of: (n: number): unknown => n },
  { name: '{ $numberLong }', of: (n: number): unknown => ({ $numberLong: String(n) }) },
  { name: '{ $numberInt }', of: (n: number): unknown => ({ $numberInt: String(n) }) },
  { name: '{ $numberDouble }', of: (n: number): unknown => ({ $numberDouble: String(n) }) },
] as const;

const answering = (value: unknown): EngagementCounterDb => ({ $runCommandRaw: jest.fn(async () => ({ ok: 1, value })) });

const KEY = { userId: '68a000000000000000000001', axisKey: 'content.reel' };

describe.each(FORMS)('une valeur rendue sous la forme $name', ({ of }) => {
  it('se décode en nombre', () => {
    expect(rawCommandNumber(of(779))).toBe(779);
    expect(rawCommandNumber(of(0))).toBe(0);
  });

  it('le crédit rend le compte d’actions et les points de la ligne', async () => {
    const state = await creditEngagementCounter(answering({ count: of(57), points: of(2000) }), { ...KEY, points: 5, count: 1 });

    expect(state).toEqual({ count: 57, points: 2000 });
  });

  it('le débit rend ce qui reste à la ligne', async () => {
    const state = await debitEngagementCounter(answering({ count: of(8), points: of(779) }), { ...KEY, points: 1221, count: 2 });

    expect(state).toEqual({ count: 8, points: 779 });
  });

  it('la reprise rend ce que la ligne tenait, jamais zéro par défaut de lecture', async () => {
    const taken = await takeBackFromEngagementCounter(answering({ count: of(2), points: of(779) }), { ...KEY, points: 1000, actions: 1 });

    expect(taken).toBe(779);
  });
});

describe('une valeur qui n’est pas un nombre', () => {
  it.each([null, undefined, 'douze', {}, { $numberLong: 'abc' }, Number.NaN, [1]])('%p se lit comme illisible', (value) => {
    expect(rawCommandNumber(value)).toBeNull();
  });
});
