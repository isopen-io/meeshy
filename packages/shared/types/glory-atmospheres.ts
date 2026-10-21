/**
 * LES SEPT ATMOSPHÈRES DES CADRES DE GLOIRE (#10148, LP0) — la liste FERMÉE,
 * dans l'ordre où l'écran de choix les montre : l'Afrique éternelle d'abord.
 *
 * Posée avant le registre des packs parce que trois lots l'importent sans
 * s'attendre : l'extension `glory-frame` du registre (L3), la validation de
 * `PUT /me/game/frames/atmosphere` (L10a) et la loi de proposition (L4). Une
 * valeur hors de cette liste est refusée, même si un pack portait son nom.
 */
export const GLORY_ATMOSPHERES = ['afrique', 'egypte', 'olympe', 'celeste', 'nord', 'abysses', 'neon'] as const;
export type GloryAtmosphere = (typeof GLORY_ATMOSPHERES)[number];

/** L'atmosphère de « Choisir plus tard » : installée par défaut, non retirable, embarquée sur iOS. */
export const DEFAULT_GLORY_ATMOSPHERE: GloryAtmosphere = 'afrique';

export const isGloryAtmosphere = (value: unknown): value is GloryAtmosphere =>
  typeof value === 'string' && (GLORY_ATMOSPHERES as readonly string[]).includes(value);
