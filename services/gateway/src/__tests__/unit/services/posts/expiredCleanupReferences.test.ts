/**
 * Un statut référencé ne doit pas être détruit avant que la personne nommée
 * ait pu l'ouvrir — sinon la promesse « vous le verrez au moins une fois » est
 * fausse dès la deuxième heure.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  buildSweepableFilter,
  REFERENCE_SWEEP_GRACE_MS,
} from '../../../../services/posts/ephemeralPosts';

const NOW = new Date('2026-08-19T12:00:00.000Z');

describe('buildSweepableFilter', () => {
  it('exige que le post soit expiré', () => {
    const filter = buildSweepableFilter(NOW) as any;
    expect(filter.expiresAt).toEqual({ lt: NOW });
  });

  it('épargne un post portant une référence dont le droit vit encore', () => {
    const filter = buildSweepableFilter(NOW) as any;
    const windowStart = new Date(NOW.getTime() - 24 * 3600_000);

    expect(filter.OR).toEqual([
      // plus aucune référence vivante…
      {
        postMentions: {
          none: {
            OR: [
              { expiredViewAt: { isSet: false } },
              { expiredViewAt: null },
              { expiredViewAt: { gt: windowStart } },
            ],
          },
        },
      },
      // …ou le plafond de grâce est dépassé, quoi qu'il arrive
      { expiresAt: { lt: new Date(NOW.getTime() - REFERENCE_SWEEP_GRACE_MS) } },
    ]);
  });

  it('fixe le plafond de grâce à 7 jours', () => {
    expect(REFERENCE_SWEEP_GRACE_MS).toBe(7 * 24 * 3600_000);
  });

  it('garde le retard de balayage de l\'appelant sans déplacer la fenêtre de référence', () => {
    const cutoff = new Date(NOW.getTime() - 3 * 24 * 3600_000);
    const filter = buildSweepableFilter(NOW, cutoff) as any;

    expect(filter.expiresAt).toEqual({ lt: cutoff });
    expect(filter.OR[0].postMentions.none.OR[2]).toEqual({
      expiredViewAt: { gt: new Date(NOW.getTime() - 24 * 3600_000) },
    });
  });
});
