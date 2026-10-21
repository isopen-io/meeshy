/**
 * CE QU'UN JOURNAL GARDE d'une erreur de base : son NOM et son CODE, rien
 * d'autre (#10782). Le message d'une erreur Prisma — et son `meta` sur une
 * requête brute — recopie les arguments de la requête (`userId`,
 * `readerKey`, clé d'événement) : un journal qui le reprend range un
 * identifiant de lecteur hors de toute rétention.
 */
export type ErrorIdentity = { readonly name: string; readonly code?: string };

export function errorIdentity(error: unknown): ErrorIdentity {
  if (!(error instanceof Error)) return { name: typeof error };
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? { name: error.name, code } : { name: error.name };
}
