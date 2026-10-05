import { describe, expect, test } from 'bun:test';

import { GUIDE_ACTIONS } from '@meeshy/shared/utils/game/guide';

import { guideActionTarget } from './action-target';

/**
 * OÙ MÈNE LE BOUTON DU GUIDE (#9379) — « Un bouton qui y mène » : chaque
 * action de la loi partagée est un lien profond. Un bouton qui ne mènerait
 * nulle part serait un contrôle qui ment.
 */
describe('chaque action de la loi a une destination', () => {
  for (const action of GUIDE_ACTIONS) {
    test(`${action} mène quelque part`, () => {
      expect(guideActionTarget(action).kind).toMatch(/^(scroll|route|photo)$/);
    });
  }
});

describe('les destinations', () => {
  test('voir son niveau, sa progression, le palier suivant : la jauge du niveau', () => {
    for (const action of ['see-level', 'see-progress', 'see-next-tier', 'prestige-or-stay'] as const) {
      expect(guideActionTarget(action)).toEqual({ kind: 'scroll', id: 'game-level' });
    }
  });

  test('les missions : la carte des missions', () => {
    for (const action of ['see-missions', 'open-first-mission', 'regain-levels', 'do-easy-mission-or-freeze', 'do-easiest-mission'] as const) {
      expect(guideActionTarget(action)).toEqual({ kind: 'scroll', id: 'game-missions' });
    }
  });

  test('la Flamme se voit en jauge, se rallume au panneau', () => {
    expect(guideActionTarget('see-flame')).toEqual({ kind: 'scroll', id: 'game-flame' });
    expect(guideActionTarget('relight-flame')).toEqual({ kind: 'scroll', id: 'game-flame-panel' });
  });

  test('le trésor et le rang', () => {
    expect(guideActionTarget('see-meeshes')).toEqual({ kind: 'scroll', id: 'game-treasury' });
    expect(guideActionTarget('keep-or-spend')).toEqual({ kind: 'scroll', id: 'game-treasury' });
    expect(guideActionTarget('see-rank')).toEqual({ kind: 'scroll', id: 'game-rank' });
  });

  test('l’aperçu de frappe', () => {
    expect(guideActionTarget('mint-or-climb')).toEqual({ kind: 'scroll', id: 'game-mint' });
    expect(guideActionTarget('see-mint-preview')).toEqual({ kind: 'scroll', id: 'game-mint' });
  });

  test('les badges : leur page', () => {
    expect(guideActionTarget('relight-badge')).toEqual({ kind: 'route', to: 'progressionBadges' });
  });

  test('le premier geste se fait AILLEURS : la liste des conversations', () => {
    expect(guideActionTarget('earn-first-points')).toEqual({ kind: 'route', to: 'list' });
    expect(guideActionTarget('start-game')).toEqual({ kind: 'route', to: 'list' });
  });

  test('les photos ouvrent le studio', () => {
    expect(guideActionTarget('take-photo')).toEqual({ kind: 'photo' });
    expect(guideActionTarget('take-start-photo')).toEqual({ kind: 'photo' });
  });
});
