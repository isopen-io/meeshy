import type { GuideAction } from '@meeshy/shared/utils/game/guide';

/**
 * OÙ MÈNE LE BOUTON DU GUIDE (#9379) — chaque action que la loi partagée
 * nomme (`GUIDE_ACTIONS`) devient un lien profond : faire défiler jusqu'à la
 * carte de l'écran Progression, ouvrir une autre page, ou ouvrir le studio
 * photo. La table est un `Record` exhaustif : une action ajoutée à la loi sans
 * destination ne compile plus.
 *
 * Les ancres sont celles que posent les composants du jeu (`game-gauges`,
 * `game-missions`, `game-mint-preview`, `game-flame-panel`).
 */

export type GuideTarget =
  | { readonly kind: 'scroll'; readonly id: string }
  | { readonly kind: 'route'; readonly to: 'list' | 'progressionBadges' }
  | { readonly kind: 'photo' };

const scroll = (id: string): GuideTarget => ({ kind: 'scroll', id });

const TARGETS: Readonly<Record<GuideAction, GuideTarget>> = {
  'start-game': { kind: 'route', to: 'list' },
  'earn-first-points': { kind: 'route', to: 'list' },
  'see-level': scroll('game-level'),
  'see-missions': scroll('game-missions'),
  'see-flame': scroll('game-flame'),
  'see-meeshes': scroll('game-treasury'),
  'see-rank': scroll('game-rank'),
  'take-start-photo': { kind: 'photo' },
  'see-progress': scroll('game-level'),
  'see-next-tier': scroll('game-level'),
  'open-first-mission': scroll('game-missions'),
  'mint-or-climb': scroll('game-mint'),
  'regain-levels': scroll('game-missions'),
  'relight-badge': { kind: 'route', to: 'progressionBadges' },
  'see-mint-preview': scroll('game-mint'),
  'take-photo': { kind: 'photo' },
  'keep-or-spend': scroll('game-treasury'),
  'do-easy-mission-or-freeze': scroll('game-missions'),
  'relight-flame': scroll('game-flame-panel'),
  'do-easiest-mission': scroll('game-missions'),
  'prestige-or-stay': scroll('game-level'),
};

export const guideActionTarget = (action: GuideAction): GuideTarget => TARGETS[action];
