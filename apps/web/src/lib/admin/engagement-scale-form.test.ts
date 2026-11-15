import { describe, expect, test } from 'bun:test';

import { DEFAULT_ENGAGEMENT_SCALE } from '@meeshy/shared/types/engagement-scale';

import { bigPointsTiers, draftOf, scaleOfDraft, tiersOf, withAddedTier, withLoyaltyYearPreset, withTier, withoutTier } from './engagement-scale-form';

/**
 * LES SÉRIES PAR ACTE ET LA FIDÉLITÉ DANS LE BROUILLON (#10395) — sans plafond à 1000 :
 * un palier de 365 jours peut valoir 100 000 points ; chaque acte a ses paliers.
 */
const base = () => draftOf(DEFAULT_ENGAGEMENT_SCALE);

describe('le brouillon des séries et de la fidélité', () => {
  test('un barème d’avant les séries par acte se relit : la globale vient de streakBonuses, les actes sont vides', () => {
    const draft = base();
    expect(tiersOf(draft, { kind: 'global' }).map((tier) => tier.days)).toEqual(DEFAULT_ENGAGEMENT_SCALE.streakBonuses.map((bonus) => String(bonus.days)));
    expect(tiersOf(draft, { kind: 'act', act: 'reel' })).toEqual([]);
    expect(tiersOf(draft, { kind: 'loyalty' })).toEqual([]);
  });

  test('un palier de série par acte de 100 000 points part dans streaks.acts, sans plafond à 1000', () => {
    const draft = withTier(withAddedTier(base(), { kind: 'act', act: 'reel' }), { kind: 'act', act: 'reel' }, 0, { days: '30', points: '100000', label: 'Un mois de réels' });
    const scale = scaleOfDraft(draft);
    expect(scale?.streaks?.acts.reel).toEqual([{ days: 30, points: 100000, label: 'Un mois de réels' }]);
  });

  test('le préréglage « un an de fidélité » pose 365 jours → 100 000 points', () => {
    const scale = scaleOfDraft(withLoyaltyYearPreset(base(), 'Un an de fidélité'));
    expect(scale?.loyalty).toEqual([{ days: 365, points: 100000, label: 'Un an de fidélité' }]);
  });

  test('la globale garde ses gros paliers ; streakBonuses en est la projection ramenée à 1000 (anciens serveurs)', () => {
    const draft = withTier(base(), { kind: 'global' }, 0, { points: '50000' });
    const scale = scaleOfDraft(draft);
    expect(scale?.streaks?.global[0]?.points).toBe(50000);
    expect(scale?.streakBonuses[0]?.points).toBe(1000);
  });

  test('un palier retiré disparaît ; deux paliers au même jour refusent le brouillon', () => {
    const removed = withoutTier(base(), { kind: 'global' }, 0);
    expect(tiersOf(removed, { kind: 'global' }).length).toBe(DEFAULT_ENGAGEMENT_SCALE.streakBonuses.length - 1);
    const duplicate = withTier(withAddedTier(withAddedTier(base(), { kind: 'loyalty' }), { kind: 'loyalty' }), { kind: 'loyalty' }, 1, { days: '1' });
    expect(scaleOfDraft(withTier(duplicate, { kind: 'loyalty' }, 0, { days: '1' }))).toBeNull();
  });

  test('au-delà de 10 000 points, un avertissement (non bloquant) nomme les paliers', () => {
    const draft = withLoyaltyYearPreset(base(), 'Un an');
    expect(bigPointsTiers(draft)).toEqual([{ key: { kind: 'loyalty' }, index: 0, points: 100000 }]);
    expect(scaleOfDraft(draft)).not.toBeNull();
  });
});
