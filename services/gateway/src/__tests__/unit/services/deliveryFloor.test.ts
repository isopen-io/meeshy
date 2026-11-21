/**
 * #19261 — la loi du plancher de livraison, exercée CHEZ ELLE.
 *
 * Les témoins de service prouvent que les trois sites la consultent ; ceux-ci
 * prouvent ce qu'elle RÉPOND, y compris sur les formes qu'aucun site ne peut
 * fabriquer — la dérive d'horloge notamment, qui n'est pas atteignable depuis
 * `markMessagesAsReceived` sans écrire une ligne de curseur incohérente à la
 * main.
 *
 * @jest-environment node
 */

import {
  DELIVERY_FLOOR_SELECT,
  deliveryFloorOf,
} from '../../../services/messaging/deliveryFloor';

const POSITION = new Date('2026-10-01T10:00:00.000Z');
const CLOCK = new Date('2026-10-01T11:00:00.000Z');

describe('deliveryFloorOf — la POSITION, jamais l’horloge murale (#19261)', () => {
  it('sert la POSITION quand les deux colonnes sont là', () => {
    expect(
      deliveryFloorOf({ lastDeliveredAt: CLOCK, lastDeliveredMessageCreatedAt: POSITION })
    ).toEqual(POSITION);
  });

  it('retombe sur l’horloge quand la position manque — repli, pas correction', () => {
    expect(
      deliveryFloorOf({ lastDeliveredAt: CLOCK, lastDeliveredMessageCreatedAt: null })
    ).toEqual(CLOCK);
  });

  it('sert la position quand l’horloge manque', () => {
    expect(
      deliveryFloorOf({ lastDeliveredAt: null, lastDeliveredMessageCreatedAt: POSITION })
    ).toEqual(POSITION);
  });

  it('rend `null` sur un curseur vide — le gel balaie alors depuis l’origine', () => {
    expect(
      deliveryFloorOf({ lastDeliveredAt: null, lastDeliveredMessageCreatedAt: null })
    ).toBeNull();
  });

  it('rend `null` quand il n’y a aucun curseur', () => {
    expect(deliveryFloorOf(null)).toBeNull();
    expect(deliveryFloorOf(undefined)).toBeNull();
  });

  it('ne RÉTRÉCIT jamais la fenêtre sous une dérive d’horloge entre serveurs', () => {
    // L'invariant attendu est `position <= horloge` : un message est créé avant
    // d'être remis. Deux serveurs dont les horloges divergent peuvent pourtant
    // écrire une position POSTÉRIEURE à l'horloge de l'accusé, et la position
    // seule bornerait alors la fenêtre PLUS HAUT qu'avant ce lot — une
    // régression introduite par le correctif lui-même. Le minimum l'interdit,
    // et élargir est sûr : le gel est write-once.
    const futurePosition = new Date('2026-10-01T11:30:00.000Z');
    expect(
      deliveryFloorOf({
        lastDeliveredAt: CLOCK,
        lastDeliveredMessageCreatedAt: futurePosition,
      })
    ).toEqual(CLOCK);
  });
});

describe('DELIVERY_FLOOR_SELECT — la projection et la descente, tenues ensemble', () => {
  it('demande les DEUX colonnes dont la loi a besoin', () => {
    // Le cœur du lot : ce que la loi LIT et ce que les sites CHARGENT ne
    // peuvent plus diverger. Réduire ce `select` ne casse pas un témoin de
    // verdict — il casse la compilation de chaque site, parce que
    // `DeliveryFloorCursor` exige les deux champs.
    expect(DELIVERY_FLOOR_SELECT).toEqual({
      lastDeliveredAt: true,
      lastDeliveredMessageCreatedAt: true,
    });
  });
});
