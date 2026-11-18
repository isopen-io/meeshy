/**
 * Témoins de `readCursorFloorOf()` — voir `read-cursor-floor.ts` pour la loi.
 *
 * Le témoin qui compte est celui de la DÉRIVE : il gèle le verdict OPPOSÉ à
 * celui de son jumeau `services/gateway/src/__tests__/unit/services/readFloor.test.ts`
 * (« prend le MINIMUM sous une dérive d'horloge »). Les deux ensemble sont ce
 * qui empêche un lot de consolider les deux formes en une seule — l'arbitrage
 * du gateway est un cliquet de NON-RÉGRESSION, et il ne se transpose pas à un
 * séparateur.
 *
 * Un site corrigé sans témoin est un site qu'on peut défaire en silence
 * (cycle 176, #19525).
 */

import { readCursorFloorOf } from './read-cursor-floor';

const POSITION = new Date('2026-11-18T10:00:00.000Z');
const CLOCK = new Date('2026-11-18T11:00:00.000Z');

describe('readCursorFloorOf — la POSITION du curseur, jamais son horloge', () => {
  it('rend la POSITION quand les deux colonnes sont là', () => {
    expect(
      readCursorFloorOf({ lastReadMessageCreatedAt: POSITION, lastReadAt: CLOCK })
    ).toEqual(POSITION);
  });

  it("retombe sur l'HORLOGE quand la position manque — une ligne d'avant la colonne", () => {
    expect(
      readCursorFloorOf({ lastReadMessageCreatedAt: null, lastReadAt: CLOCK })
    ).toEqual(CLOCK);
  });

  it("rend la POSITION quand c'est l'horloge qui manque", () => {
    expect(
      readCursorFloorOf({ lastReadMessageCreatedAt: POSITION, lastReadAt: null })
    ).toEqual(POSITION);
  });

  it('rend `null` sur un curseur VIDE — aucune position connue', () => {
    expect(readCursorFloorOf({ lastReadMessageCreatedAt: null, lastReadAt: null })).toBeNull();
  });

  it('rend `null` sur un curseur ABSENT', () => {
    expect(readCursorFloorOf(null)).toBeNull();
    expect(readCursorFloorOf(undefined)).toBeNull();
  });

  it('traite `undefined` comme `null` sur chaque colonne', () => {
    expect(
      readCursorFloorOf({ lastReadMessageCreatedAt: undefined, lastReadAt: CLOCK })
    ).toEqual(CLOCK);
    expect(
      readCursorFloorOf({ lastReadMessageCreatedAt: POSITION, lastReadAt: undefined })
    ).toEqual(POSITION);
  });

  it('garde la POSITION sous une dérive d’horloge — JAMAIS le minimum du gateway', () => {
    // `position > horloge` est impossible sur donnée saine (un message est créé
    // avant d'être lu) : c'est une dérive entre deux serveurs, et c'est le SEUL
    // cas où cette loi et `readFloorOf` divergent.
    //
    // Ici la position GAGNE, parce qu'elle est la valeur AUTORITATIVE de ce que
    // le curseur a franchi et qu'aucun lecteur de cette loi n'a le passé
    // ancré-sur-l'horloge que le cliquet du gateway protège. L'abaisser ferait
    // redevenir « non lu » chaque message de `(horloge, position]` — un
    // séparateur qui fait remonter le lecteur dans du déjà-lu, sans qu'aucun
    // non-lu ne soit en jeu.
    const driftedPosition = new Date('2026-11-18T12:00:00.000Z');

    expect(
      readCursorFloorOf({ lastReadMessageCreatedAt: driftedPosition, lastReadAt: CLOCK })
    ).toEqual(driftedPosition);
  });

  it('accepte deux colonnes ÉGALES sans préférer l’horloge', () => {
    expect(
      readCursorFloorOf({ lastReadMessageCreatedAt: POSITION, lastReadAt: POSITION })
    ).toEqual(POSITION);
  });
});
