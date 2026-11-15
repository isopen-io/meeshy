/**
 * CE QU'UN CLIENT SAIT DU JEU (#9392, rétrocompatibilité #9223) — la production a
 * des utilisateurs : un ancien client doit fonctionner contre le nouveau
 * serveur. Les paliers de badges 1 000 (Obsidienne) et 5 000 (Prisme) s'AJOUTENT
 * à la suite des cinq d'origine ; un client qui ne les connaît pas ne les reçoit
 * pas dans ses listes (`servedBadgeThresholds`, loi partagée), jusqu'à zéro usage
 * mesuré de l'ancienne version.
 *
 * Un client déclare qu'il connaît la vague 2 par l'en-tête `X-Meeshy-Game-Version`
 * (entier, 2 ou plus). Absent, illisible ou inférieur : il ne la connaît pas — le
 * repli est l'ancien comportement, jamais le nouveau.
 */

import { BADGE_THRESHOLDS } from '@meeshy/shared/types/engagement';
import { servedBadgeThresholds } from '@meeshy/shared/utils/game/badge-tiers';

export const GAME_VERSION_HEADER = 'x-meeshy-game-version';

export const GAME_WAVE_2 = 2;

export function knowsGameWave2(headers: Readonly<Record<string, string | string[] | undefined>>): boolean {
  const raw = headers[GAME_VERSION_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const version = value === undefined ? Number.NaN : Number.parseInt(value, 10);
  return Number.isInteger(version) && version >= GAME_WAVE_2;
}

/** Le palier d'une clé de badge (`content.text_message:1000` → 1000), `null` si la clé n'en porte pas. */
export function badgeThresholdOfKey(milestoneKey: string): number | null {
  const tail = milestoneKey.slice(milestoneKey.lastIndexOf(':') + 1);
  const threshold = Number(tail);
  return Number.isInteger(threshold) && (BADGE_THRESHOLDS as readonly number[]).includes(threshold) ? threshold : null;
}

/**
 * Ne garde d'une liste de jalons que ce que ce client sait lire : les badges aux
 * paliers étendus ne partent qu'aux clients de la vague 2. Les autres types de
 * jalons (série, niveau, succès) ne sont jamais touchés.
 */
export function milestonesServedTo<T extends { readonly milestoneType: string; readonly milestoneKey: string }>(
  milestones: readonly T[],
  client: { readonly knowsExtendedTiers: boolean },
): T[] {
  const served = new Set(servedBadgeThresholds(client));
  return milestones.filter((m) => {
    if (m.milestoneType !== 'badge') return true;
    const threshold = badgeThresholdOfKey(m.milestoneKey);
    return threshold === null || served.has(threshold);
  });
}
