/**
 * La loi de déclenchement de la mention (#14053, directive porteur 2026-10-31),
 * UNE pour les trois clients — le web la consomme, iOS (`MentionLookupRule`) et
 * Android (`MentionLookupLaw`) en portent le miroir :
 *
 * - « @ » ouvre TOUJOURS d'abord le cache local de contacts, filtré par la saisie ;
 * - le réseau n'est appelé qu'à partir du TROISIÈME caractère, pour faire remonter
 *   les autres personnes du contexte (intervenants d'un post, membres…) ;
 * - sauf si les deux premières lettres ne trouvent personne en local : alors le
 *   réseau part dès la SECONDE lettre.
 */
export type MentionLookupStage = 'local' | 'remote';

export const MENTION_REMOTE_MIN_CHARS = 3;
export const MENTION_REMOTE_EARLY_CHARS = 2;

export function mentionLookupStage(input: { readonly query: string; readonly localMatchCount: number }): MentionLookupStage {
  const length = input.query.trim().length;
  if (length >= MENTION_REMOTE_MIN_CHARS) return 'remote';
  if (length === MENTION_REMOTE_EARLY_CHARS && input.localMatchCount === 0) return 'remote';
  return 'local';
}

/**
 * Les correspondances locales d'abord (le cache de contacts, instantané), puis le
 * serveur dans SON ordre (connaissances, contexte, contacts, annuaire), sans doublon
 * et sans l'appelant.
 */
export function mergeMentionSuggestions<T extends { readonly id: string }>(input: {
  readonly local: readonly T[];
  readonly remote: readonly T[];
  readonly selfId?: string;
}): T[] {
  return [...input.local, ...input.remote].reduce<T[]>(
    (acc, candidate) =>
      candidate.id === input.selfId || acc.some((s) => s.id === candidate.id) ? acc : [...acc, candidate],
    []
  );
}
