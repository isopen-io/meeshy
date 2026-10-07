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
      expect(guideActionTarget(action).kind).toMatch(/^(fiche|route|photo)$/);
    });
  }
});

describe('les destinations', () => {
  test('voir son niveau, sa progression, le palier suivant : la jauge du niveau', () => {
    for (const action of ['see-level', 'see-progress', 'see-next-tier', 'prestige-or-stay'] as const) {
      expect(guideActionTarget(action)).toEqual({ kind: 'fiche', concept: 'level' });
    }
  });

  test('les missions : la carte des missions', () => {
    for (const action of ['see-missions', 'open-first-mission', 'regain-levels', 'do-easy-mission-or-freeze', 'do-easiest-mission'] as const) {
      expect(guideActionTarget(action)).toEqual({ kind: 'fiche', concept: 'missions' });
    }
  });

  test('la Flamme se voit en jauge, se rallume au panneau', () => {
    expect(guideActionTarget('see-flame')).toEqual({ kind: 'fiche', concept: 'flame' });
    expect(guideActionTarget('relight-flame')).toEqual({ kind: 'fiche', concept: 'flame' });
  });

  test('le trésor et le rang', () => {
    expect(guideActionTarget('see-meeshes')).toEqual({ kind: 'fiche', concept: 'meesh' });
    expect(guideActionTarget('keep-or-spend')).toEqual({ kind: 'fiche', concept: 'meesh' });
    expect(guideActionTarget('see-rank')).toEqual({ kind: 'fiche', concept: 'glory' });
  });

  test('l’aperçu de frappe', () => {
    expect(guideActionTarget('mint-or-climb')).toEqual({ kind: 'fiche', concept: 'meesh' });
    expect(guideActionTarget('see-mint-preview')).toEqual({ kind: 'fiche', concept: 'meesh' });
  });

  test('les badges : leur fiche (la page des badges est à un toucher, sous elle)', () => {
    expect(guideActionTarget('relight-badge')).toEqual({ kind: 'fiche', concept: 'badges' });
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

describe('les destinations de la vague 2 (#9481)', () => {
  /* La carte de navigation (#9563, amendement n° 4) : le guide ouvre la FICHE du concept, sa sous-page est à un toucher. */
  test('chaque nouveau bouton mène à la fiche de son concept', () => {
    expect(guideActionTarget('see-league')).toEqual({ kind: 'fiche', concept: 'league' });
    expect(guideActionTarget('see-season')).toEqual({ kind: 'fiche', concept: 'season' });
    expect(guideActionTarget('see-trophies')).toEqual({ kind: 'fiche', concept: 'showcase' });
    expect(guideActionTarget('see-atlas')).toEqual({ kind: 'fiche', concept: 'atlas' });
  });
});
