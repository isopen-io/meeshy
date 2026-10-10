import type { GuideAction } from '@meeshy/shared/utils/game/guide';
import type { GuideActionV2 } from '@meeshy/shared/utils/game/guide-v2';
import type { ProgressionConcept } from '@meeshy/shared/utils/progression-layout';

/**
 * OÙ MÈNE LE BOUTON DU GUIDE (#9379) — chaque action que la loi partagée
 * nomme (`GUIDE_ACTIONS`) devient un lien profond : ouvrir la FICHE d'un concept,
 * ouvrir la liste des conversations (le premier geste se fait AILLEURS), ou
 * ouvrir le studio photo. Jamais une sous-page ni la racine : la carte de
 * navigation (#9563, amendement n° 4, `lib/game/progression-nav.ts`) veut que le
 * guide ouvre la fiche du concept dont il parle — sa sous-page est à un toucher,
 * et son retour remonte la chaîne. La table est un `Record` exhaustif : une
 * action ajoutée à la loi sans destination ne compile plus.
 */

/** La seule page hors fiche où un bouton du guide peut mener : la liste, où l'on gagne ses premiers points. */
export type GuideRoute = 'list';

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
  'relight-badge': fiche('badges'),
  'see-mint-preview': fiche('meesh'),
  'take-photo': { kind: 'photo' },
  'keep-or-spend': fiche('meesh'),
  'do-easy-mission-or-freeze': fiche('missions'),
  'relight-flame': fiche('flame'),
  'do-easiest-mission': fiche('missions'),
  'prestige-or-stay': fiche('level'),
  /* LA VAGUE 2 (#9481) : la fiche de chaque concept, sa sous-page à un toucher. */
  'see-league': fiche('league'),
  'see-season': fiche('season'),
  'see-trophies': fiche('showcase'),
  'see-atlas': fiche('atlas'),
};

export const guideActionTarget = (action: GuideAction | GuideActionV2): GuideTarget => TARGETS[action];
