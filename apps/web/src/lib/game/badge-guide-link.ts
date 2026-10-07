import { BADGE_MATERIAL_KEYS, type BadgeMaterialKey } from '@meeshy/shared/utils/game/badge-tiers';

import { GAME_BADGE_MATERIALS, type GameMaterial } from './materials';

/**
 * « COMPRENDRE LES BADGES » (#9639) — UNE adresse : la section badges du carnet
 * des règles (`routes/progression-rules-badges.tsx`), ancrée. La fiche d'un
 * badge et la page des badges la portent ; le carnet la lit (`?section=badges`)
 * et y fait défiler. Sans aucun mot : le carnet ne charge pas la partie
 * `concept` du catalogue, et ce module ne doit pas l'y entraîner.
 */

/** L'ancre de la section badges du carnet des règles. */
export const BADGES_SECTION_ID = 'regles-badges';

/** Le lien que portent toutes les entrées « Comprendre les badges ». */
export const BADGES_GUIDE_LINK = { to: 'progressionRegles', search: { section: 'badges' } } as const;

/** La section que l'adresse du carnet désigne (`?section=badges`). */
export const isBadgesSection = (value: string | null): boolean => value === BADGES_GUIDE_LINK.search.section;

/** La matière web d'une clé de matière partagée : les deux tables suivent le même ordre, du cuivre au prisme. */
export const webMaterial = (key: BadgeMaterialKey): GameMaterial => GAME_BADGE_MATERIALS[BADGE_MATERIAL_KEYS.indexOf(key)] ?? 'copper';
