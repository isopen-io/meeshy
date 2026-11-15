/**
 * Reconnaît un refus de DÉBIT (@fastify/rate-limit) arrivé au gestionnaire
 * d'erreurs global, et en fait une réponse qui le dit (#11462).
 *
 * Le plugin `throw`e l'objet que rend `errorResponseBuilder` — un objet NU,
 * jamais une `Error` — portant `statusCode: 429`. Sans cette reconnaissance, le
 * gestionnaire global le journalisait en ERROR « Uncaught error in request
 * handler » et REMPLAÇAIT son corps par « Internal Server Error / An unexpected
 * error occurred » : le client ne lisait jamais `RATE_LIMIT_EXCEEDED`, et la
 * supervision comptait une panne là où le produit se défendait normalement.
 *
 * Deux formes existent dans le dépôt, et les deux sont lues : `error` en chaîne
 * plate (les fabriques de `middleware/rate-limiter.ts`, et désormais celles de
 * `middleware/rate-limit.ts`), et l'ancienne forme `error: { code, message }`.
 */

export type RateLimitRefusalResponse = {
  readonly statusCode: 429;
  readonly error: string;
  readonly message: string;
  readonly code: string;
};

const CODE_PAR_DEFAUT = 'RATE_LIMIT_EXCEEDED';
const TEXTE_PAR_DEFAUT = 'Too many requests. Please try again later.';

const chaine = (valeur: unknown): string | null => (typeof valeur === 'string' && valeur.length > 0 ? valeur : null);

export function rateLimitRefusalResponse(error: unknown): RateLimitRefusalResponse | null {
  if (typeof error !== 'object' || error === null || error instanceof Error) return null;
  const refus = error as { readonly statusCode?: unknown; readonly error?: unknown; readonly code?: unknown; readonly message?: unknown };
  if (refus.statusCode !== 429) return null;

  const imbrique = typeof refus.error === 'object' && refus.error !== null
    ? (refus.error as { readonly code?: unknown; readonly message?: unknown })
    : null;
  const texte = chaine(refus.error) ?? chaine(imbrique?.message) ?? chaine(refus.message) ?? TEXTE_PAR_DEFAUT;
  const code = chaine(refus.code) ?? chaine(imbrique?.code) ?? CODE_PAR_DEFAUT;

  return { statusCode: 429, error: texte, message: chaine(refus.message) ?? texte, code };
}
