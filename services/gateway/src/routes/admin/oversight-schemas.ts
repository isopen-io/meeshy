/**
 * Les briques de schéma de RÉPONSE que partagent les surfaces de supervision
 * de l'administration (#8876).
 *
 * Chaque objet nomme ses `properties` : sous `fast-json-stringify`, un champ non
 * déclaré est supprimé en silence, et un schéma ouvert laisserait partir tout ce
 * que le gestionnaire remet — y compris ce que personne n'a voulu exposer. Ces
 * briques ne posent donc JAMAIS `additionalProperties: true`.
 */
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

export const chaine = { type: 'string' } as const;
export const chaineNulle = { type: 'string', nullable: true } as const;
export const dateServie = { type: 'string', format: 'date-time' } as const;
export const dateNulle = { type: 'string', format: 'date-time', nullable: true } as const;
export const booleen = { type: 'boolean' } as const;
export const booleenNul = { type: 'boolean', nullable: true } as const;
export const nombre = { type: 'number' } as const;
export const nombreNul = { type: 'number', nullable: true } as const;

/** `A` — la personne telle que la console la nomme : jamais un simple identifiant. */
export const personneSchema = {
  type: 'object',
  nullable: true,
  properties: {
    id: chaine,
    username: chaine,
    displayName: chaineNulle,
    avatar: chaineNulle,
  },
} as const;

export const paginationSchema = {
  type: 'object',
  properties: {
    total: nombre,
    limit: nombre,
    offset: nombre,
    hasMore: booleen,
  },
} as const;

/** L'enveloppe d'une réponse de succès à objet unique. */
export const enveloppe = (data: Record<string, unknown>) => ({
  type: 'object',
  properties: { success: booleen, message: chaine, data },
});

/** L'enveloppe d'une liste paginée — la pagination voyage À CÔTÉ de `data` (V1). */
export const enveloppePaginee = (item: Record<string, unknown>) => ({
  type: 'object',
  properties: {
    success: booleen,
    data: { type: 'array', items: item },
    pagination: paginationSchema,
  },
});

export const reponsesEnErreur = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
  500: errorResponseSchema,
} as const;
