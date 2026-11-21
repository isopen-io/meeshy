/**
 * La loi du plancher du curseur de LECTURE (#19299).
 *
 * Jumelle de `deliveryFloor.test.ts`. Le cas de la dérive d'horloge n'est
 * fabricable par AUCUN site de production — il est exercé ici, chez la loi,
 * parce que c'est le seul endroit où il peut l'être.
 *
 * @jest-environment node
 */

import { readFloorOf, READ_FLOOR_SELECT } from '../../../services/messaging/readFloor';

const POSITION = new Date('2026-10-01T10:00:00.000Z');
const CLOCK = new Date('2026-10-01T11:00:00.000Z');

describe('readFloorOf — la POSITION du curseur de lecture, jamais son horloge', () => {
  it('rend la POSITION quand les deux colonnes sont là', () => {
    expect(
      readFloorOf({ lastReadAt: CLOCK, lastReadMessageCreatedAt: POSITION })
    ).toEqual(POSITION);
  });

  it("retombe sur l'HORLOGE quand la position manque — non-régression, pas correction", () => {
    expect(
      readFloorOf({ lastReadAt: CLOCK, lastReadMessageCreatedAt: null })
    ).toEqual(CLOCK);
  });

  it('rend la POSITION quand c’est l’horloge qui manque', () => {
    expect(
      readFloorOf({ lastReadAt: null, lastReadMessageCreatedAt: POSITION })
    ).toEqual(POSITION);
  });

  it('rend `null` sur un curseur VIDE — gel depuis l’origine de la conversation', () => {
    expect(readFloorOf({ lastReadAt: null, lastReadMessageCreatedAt: null })).toBeNull();
  });

  it('rend `null` sur un curseur ABSENT', () => {
    expect(readFloorOf(null)).toBeNull();
    expect(readFloorOf(undefined)).toBeNull();
  });

  it('prend le MINIMUM sous une dérive d’horloge — abaisser, jamais rétrécir', () => {
    // `position > horloge` est impossible sur donnée saine (un message est créé
    // avant d'être lu) et se produit sous une dérive entre deux serveurs. La
    // position SEULE rétrécirait alors le plancher sous ce qu'il couvrait avant
    // ce lot : une régression introduite par le correctif.
    const driftedPosition = new Date('2026-10-01T12:00:00.000Z');
    expect(
      readFloorOf({ lastReadAt: CLOCK, lastReadMessageCreatedAt: driftedPosition })
    ).toEqual(CLOCK);
  });

  it('accepte deux colonnes ÉGALES sans préférer l’horloge', () => {
    expect(
      readFloorOf({ lastReadAt: POSITION, lastReadMessageCreatedAt: POSITION })
    ).toEqual(POSITION);
  });
});

describe('READ_FLOOR_SELECT — la projection voyage AVEC la descente', () => {
  it('demande les DEUX colonnes, jamais la seule horloge', () => {
    expect(READ_FLOOR_SELECT).toEqual({
      lastReadAt: true,
      lastReadMessageCreatedAt: true,
    });
  });
});
