import type { GuideAction } from '@meeshy/shared/utils/game/guide';
import type { GuideActionV2 } from '@meeshy/shared/utils/game/guide-v2';
import type { ProgressionConcept } from '@meeshy/shared/utils/progression-layout';

/**
 * OÙ MÈNE LE BOUTON DU GUIDE (#9379) — chaque action que la loi partagée
 * nomme (`GUIDE_ACTIONS`) devient un lien profond : ouvrir la FICHE d'un concept
 * (#9563 — la première page ne porte plus les cartes du jeu, elles vivent dans
 * les fiches), ouvrir une autre page, ou ouvrir le studio photo. La table est un
 * `Record` exhaustif : une action ajoutée à la loi sans destination ne compile
 * plus.
 */

/** Les pages où un bouton du guide peut mener : l'accueil, les badges, et les quatre pages de la vague 2 (#9481). */
export type GuideRoute = 'list' | 'progressionBadges' | 'progressionLigue' | 'progressionSaison' | 'progressionVitrine' | 'progressionAtlas';

export type GuideTarget =
  | { readonly kind: 'fiche'; readonly concept: ProgressionConcept }
  | { readonly kind: 'route'; readonly to: GuideRoute }
  | { readonly kind: 'photo' };

const fiche = (concept: ProgressionConcept): GuideTarget => ({ kind: 'fiche', concept });

const TARGETS: Readonly<Record<GuideAction | GuideActionV2, GuideTarget>> = {
  'start-game': { kind: 'route', to: 'list' },
  'earn-first-points': { kind: 'route', to: 'list' },
  'see-level': fiche('level'),
  'see-missions': fiche('missions'),
  'see-flame': fiche('flame'),
  'see-meeshes': fiche('meesh'),
  'see-rank': fiche('glory'),
  'take-start-photo': { kind: 'photo' },
  'see-progress': fiche('level'),
  'see-next-tier': fiche('level'),
  'open-first-mission': fiche('missions'),
  'mint-or-climb': fiche('meesh'),
  'regain-levels': fiche('missions'),
  'relight-badge': { kind: 'route', to: 'progressionBadges' },
  'see-mint-preview': fiche('meesh'),
  'take-photo': { kind: 'photo' },
  'keep-or-spend': fiche('meesh'),
  'do-easy-mission-or-freeze': fiche('missions'),
  'relight-flame': fiche('flame'),
  'do-easiest-mission': fiche('missions'),
  'prestige-or-stay': fiche('level'),
  /* LA VAGUE 2 (#9481) : une page par destination. */
  'see-league': { kind: 'route', to: 'progressionLigue' },
  'see-season': { kind: 'route', to: 'progressionSaison' },
  'see-trophies': { kind: 'route', to: 'progressionVitrine' },
  'see-atlas': { kind: 'route', to: 'progressionAtlas' },
};

export const guideActionTarget = (action: GuideAction | GuideActionV2): GuideTarget => TARGETS[action];
