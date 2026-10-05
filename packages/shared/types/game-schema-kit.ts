/**
 * LES BRIQUES DE SCHÉMA DU JEU — les primitives Zod que le bloc `game` et ses
 * écritures partagent (#9378, #9384 à #9392). Extraites de `game.ts` pour que
 * `game-v2.ts` (la vague 2) les emploie sans importer `game.ts`, qui l'importe.
 */

import { z } from 'zod';

export const nonNegativeInt = z.number().int().min(0);
export const fraction = z.number().min(0).max(1);
export const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const isoDate = z.string().min(1);

/** Identifiant d'idempotence : borné comme celui de la frappe — un UUID, pas un champ libre. */
export const requestIdSchema = z.string().min(8).max(64);

export const writeRequest = z.object({ requestId: requestIdSchema });

/** Une énumération Zod bâtie sur une liste de clés du catalogue — la clé reste typée. */
export const enumOf = <T extends string>(values: readonly T[]) => z.enum(values as unknown as readonly [T, ...T[]]);
