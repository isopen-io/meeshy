/**
 * LA LOI DE LA MASCOTTE (#8907) — le personnage qui guide, compte les points,
 * pousse à frapper la Meesh et célèbre.
 *
 * La loi ne dessine rien et ne dit rien en toutes lettres : elle rend une
 * HUMEUR et une LIGNE typée, que chaque client habille de son personnage
 * (#8908) et de sa langue. C'est ce qui laisse le web et iOS dire la même
 * chose au même moment sans recopier la préséance.
 *
 * Deux questions, deux fonctions :
 *  - `mascotEvent` : que vient-il de se passer entre deux lectures de
 *    `GET /me/engagement` ? Une première lecture n'est jamais un événement —
 *    célébrer un état acquis depuis des semaines serait un bruit.
 *  - `mascotMoment` : que vit la mascotte maintenant ? L'événement gagne sur
 *    l'état ; parmi les états, ce qu'on peut FAIRE (frapper) gagne sur ce
 *    qu'on constate (série, compte à rebours).
 */

import type { EngagementAchievementKey } from '../types/engagement.js';
import type { EngagementProgress } from './engagement-progress.js';

export type MascotEvent =
  | { readonly kind: 'meesh-minted'; readonly balance: number }
  | { readonly kind: 'level-up'; readonly level: number }
  | { readonly kind: 'achievement'; readonly key: EngagementAchievementKey };

export type MascotMood = 'cheer' | 'minting' | 'ready' | 'guide' | 'streak' | 'counting';

export type MascotLine =
  | MascotEvent
  | { readonly kind: 'can-mint'; readonly mintCost: number }
  | { readonly kind: 'first-step' }
  | { readonly kind: 'streak'; readonly days: number }
  | { readonly kind: 'meesh-missing'; readonly missing: number }
  | { readonly kind: 'level-missing'; readonly missing: number; readonly nextLevel: number }
  | { readonly kind: 'top-level' };

export type MascotMoment = {
  readonly mood: MascotMood;
  readonly line: MascotLine;
};

/** Une série se salue à partir de deux jours : un seul jour n'est pas encore une série. */
export const MASCOT_STREAK_MIN_DAYS = 2;

const newlyUnlocked = (previous: EngagementProgress, current: EngagementProgress): EngagementAchievementKey | null => {
  const before = new Set(previous.achievements.filter((a) => a.unlocked).map((a) => a.key));
  return current.achievements.find((a) => a.unlocked && !before.has(a.key))?.key ?? null;
};

/**
 * Seul `mintedLifetime` dit qu'une frappe a eu lieu : le solde monte aussi
 * sur un don reçu, qui n'est pas un geste de l'utilisateur.
 */
export function mascotEvent(previous: EngagementProgress | null, current: EngagementProgress): MascotEvent | null {
  if (previous === null) return null;

  const mintedBefore = previous.meesh?.mintedLifetime ?? 0;
  const mintedNow = current.meesh?.mintedLifetime ?? 0;
  if (current.meesh !== undefined && mintedNow > mintedBefore) {
    return { kind: 'meesh-minted', balance: current.meesh.balance };
  }

  if (current.level.level > previous.level.level) return { kind: 'level-up', level: current.level.level };

  const key = newlyUnlocked(previous, current);
  return key === null ? null : { kind: 'achievement', key };
}

const eventMood = (event: MascotEvent): MascotMood => (event.kind === 'meesh-minted' ? 'minting' : 'cheer');

export function mascotMoment(progress: EngagementProgress, event: MascotEvent | null): MascotMoment {
  if (event !== null) return { mood: eventMood(event), line: event };

  const { meesh, level, streak } = progress;
  if (meesh?.canMint === true) return { mood: 'ready', line: { kind: 'can-mint', mintCost: meesh.mintCost } };
  if (progress.isEmpty) return { mood: 'guide', line: { kind: 'first-step' } };
  if (streak.currentDays >= MASCOT_STREAK_MIN_DAYS) {
    return { mood: 'streak', line: { kind: 'streak', days: streak.currentDays } };
  }
  if (meesh !== undefined) return { mood: 'counting', line: { kind: 'meesh-missing', missing: meesh.missingPoints } };
  if (level.nextThreshold === null) return { mood: 'cheer', line: { kind: 'top-level' } };
  return {
    mood: 'counting',
    line: { kind: 'level-missing', missing: level.nextThreshold - level.value, nextLevel: level.level + 1 },
  };
}
