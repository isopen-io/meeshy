/**
 * LES CONSTANTES DES RÉGLAGES PHOTO, SANS SCHÉMA (#10163, L10b) — la partie de `game-photo.ts` que les
 * CLIENTS lisent : les trois valeurs de « Me proposer d'immortaliser », les plafonds des lots et la grammaire
 * d'une étape. Séparées des schémas parce que `game-photo.ts` importe le `zod` COMPLET : un client bâti sur
 * `zod/mini` qui en importerait une seule constante embarquerait tout le moteur (web : chunk `zod`, plafond
 * mesuré, `budgets.json`). `game-photo.ts` les ré-exporte : la passerelle ne change rien.
 */

/** « Me proposer d'immortaliser » : chaque étape (défaut), les grands moments, jamais (le carnet garde tout). */
export const PHOTO_INVITATIONS = ['every', 'major', 'never'] as const;
export type PhotoInvitations = (typeof PHOTO_INVITATIONS)[number];
export const DEFAULT_PHOTO_INVITATIONS: PhotoInvitations = 'every';

export const isPhotoInvitations = (value: unknown): value is PhotoInvitations =>
  typeof value === 'string' && (PHOTO_INVITATIONS as readonly string[]).includes(value);

/** Le registre servi : les lignes les plus récentes, jamais plus. */
export const PHOTO_MOMENTS_SERVED_MAX = 64;
/** Un accusé de présentation porte au plus ce nombre d'étapes. */
export const PHOTO_PRESENTED_MAX = 64;
/** Un signal « immortalisée » porte au plus ce nombre d'étapes — le même lot que l'accusé. */
export const PHOTO_KEPT_MAX = 64;
/** Une étape : `start`, `rank:or:2`, `meesh:40`, `trophy:…`, `league-up:2026-10-12:jade`… */
export const PHOTO_STEP_ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9:._-]{0,95}$';
