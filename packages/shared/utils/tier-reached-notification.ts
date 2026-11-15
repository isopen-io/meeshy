/**
 * LA NOTIFICATION D'UN PALIER FRANCHI — le palier ET l'exploit (#10298).
 *
 * Directive porteur 2026-10-12 : « donner le nouveau palier mais aussi ce
 * qu'on a fait pour atteindre ce palier — “1000 commentaires, bravo vous êtes
 * au 10e palier” ». Trois échelles du jeu se franchissent par un geste, et
 * chacune disait la moitié de la phrase : le badge annonçait son SEUIL comme
 * un palier (« palier 1000 », lu comme un millième palier), le succès son
 * exploit sans palier, le niveau son rang sans ce qui l'a fait atteindre.
 *
 * Le TITRE porte le palier, le CORPS l'exploit chiffré ET le palier : un
 * client qui ne rend que le corps (écran verrouillé Android, ancien client)
 * dit encore la phrase entière. Composé à la langue du LECTEUR, nombres
 * formatés selon elle. Le niveau est celui du JEU, et ce qui l'a fait atteindre, les étincelles (#10901).
 */

import { tiersOf, type AchievementFamily } from '../types/achievement-catalog.js';
import { BADGE_THRESHOLDS, type EngagementAxisKey } from '../types/engagement.js';
import { achievementLabel, formatNotificationNumber } from './achievement-labels.js';
import { engagementAxisLabel } from './engagement-labels.js';
import { notificationString } from './notification-strings.js';

export type TierReached =
  | { readonly kind: 'achievement'; readonly family: AchievementFamily; readonly tier: number }
  | { readonly kind: 'badge'; readonly axisKey: EngagementAxisKey; readonly threshold: number }
  /**
   * Un niveau du JEU (#10901) : `level` est celui que sert le bloc `game` (`levelFromScore` sur la poche, #10892), `sparks`
   * la poche qui l'a fait atteindre. Plus jamais le rang d'un palier de score.
   */
  | { readonly kind: 'level'; readonly level: number; readonly sparks: number };

export type TierReachedNotification = {
  readonly title: string;
  readonly body: string;
  /** Le RANG du palier dans son échelle, à partir de 1. */
  readonly rank: number;
  /** La grandeur franchie — le nombre de gestes, ou les étincelles en poche pour un niveau. */
  readonly value: number;
};

const rankIn = (scale: readonly number[], value: number): number | null => {
  const index = scale.indexOf(value);
  return index === -1 ? null : index + 1;
};

/**
 * `null` quand la valeur n'appartient pas à son échelle ou que l'exploit n'a
 * pas de mot dans le catalogue : on n'annonce rien plutôt qu'une clé ou un
 * « palier 0 ».
 */
export function tierReachedNotification(
  lang: string | null | undefined,
  reached: TierReached,
): TierReachedNotification | null {
  switch (reached.kind) {
    case 'achievement': {
      const rank = rankIn(tiersOf(reached.family), reached.tier);
      const exploit = achievementLabel(lang ?? 'fr', reached.family, reached.tier);
      if (rank === null || exploit === null) return null;
      return tierNotification(lang, exploit, rank, reached.tier);
    }
    case 'badge': {
      const rank = rankIn(BADGE_THRESHOLDS, reached.threshold);
      if (rank === null) return null;
      const exploit = notificationString(lang, 'engagement.badgeExploit', {
        title: engagementAxisLabel(lang, reached.axisKey),
        value: formatNotificationNumber(lang, reached.threshold),
      });
      return tierNotification(lang, exploit, rank, reached.threshold);
    }
    case 'level': {
      const { level, sparks } = reached;
      if (!Number.isInteger(level) || level < 1 || !Number.isFinite(sparks) || sparks < 0) return null;
      return {
        title: notificationString(lang, 'engagement.levelUp', { count: level }),
        body: notificationString(lang, 'engagement.levelUpBody', {
          value: formatNotificationNumber(lang, Math.trunc(sparks)),
          count: level,
        }),
        rank: level,
        value: Math.trunc(sparks),
      };
    }
  }
}

function tierNotification(
  lang: string | null | undefined,
  exploit: string,
  rank: number,
  value: number,
): TierReachedNotification {
  return {
    title: notificationString(lang, 'engagement.tierTitle', { count: rank }),
    body: notificationString(lang, 'engagement.tierBody', { title: exploit, count: rank }),
    rank,
    value,
  };
}
