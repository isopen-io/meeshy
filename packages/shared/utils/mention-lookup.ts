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
 * Qui peut-on mentionner dans une conversation ? UNE table, lue par la passerelle
 * (recherche ET validation à l'envoi, #7852) et par les trois clients (#14071) :
 *
 *   interlocutor  conversation directe : l'autre participant, seul
 *   members       groupe : tout membre actif, et personne d'autre
 *   directory     public, global, broadcast : tout compte
 *
 * Un type inconnu n'a aucune portée : `null`, et personne n'est mentionnable.
 */
export type MentionableScope = 'interlocutor' | 'members' | 'directory';

export function mentionableScope(conversationType: string | null | undefined): MentionableScope | null {
  switch (conversationType) {
    case 'direct':
      return 'interlocutor';
    case 'group':
      return 'members';
    case 'public':
    case 'global':
    case 'broadcast':
      return 'directory';
    default:
      return null;
  }
}

/**
 * Ce qu'un lecteur peut citer dans UNE conversation : la portée de son type, et
 * les membres que le client connaît. Un non-membre ne cite personne (#14066) —
 * la passerelle lui refuse la recherche et ignore ses mentions à l'envoi.
 */
export type MentionReach = {
  readonly scope: MentionableScope | null;
  readonly memberIds: readonly string[];
};

export function mentionReachOf(input: {
  readonly type: string | null | undefined;
  readonly isMember?: boolean;
  readonly memberIds: readonly string[];
}): MentionReach {
  return {
    scope: input.isMember === false ? null : mentionableScope(input.type),
    memberIds: input.memberIds,
  };
}

/** Une mention de `candidateId` aurait-elle un effet ici ? Le miroir client de la validation à l'envoi. */
export function isMentionableIn(input: {
  readonly reach: MentionReach;
  readonly candidateId: string;
  readonly selfId?: string | null;
}): boolean {
  switch (input.reach.scope) {
    case 'directory':
      return true;
    case 'members':
      return input.reach.memberIds.includes(input.candidateId);
    case 'interlocutor':
      return input.candidateId !== input.selfId && input.reach.memberIds.includes(input.candidateId);
    default:
      return false;
  }
}

/**
 * Les correspondances locales d'abord (le cache de contacts, instantané), puis le
 * serveur dans SON ordre (connaissances, contexte, contacts, annuaire), sans doublon
 * et sans l'appelant.
 *
 * Avec une `reach` (une conversation), une suggestion SANS EFFET n'est pas affichée
 * (#14071, décision porteur) : un contact local hors de la portée est retiré. Le
 * serveur a déjà appliqué la même portée à SA réponse — et il connaît tous les
 * membres, quand le client n'en tient souvent qu'une partie —, donc sa liste reste,
 * sauf sans portée du tout (type inconnu, non-membre) : alors rien.
 * Sans `reach` (un post, l'annuaire), aucune contrainte de conversation.
 */
export function mergeMentionSuggestions<T extends { readonly id: string }>(input: {
  readonly local: readonly T[];
  readonly remote: readonly T[];
  readonly selfId?: string;
  readonly reach?: MentionReach;
}): T[] {
  const { reach } = input;
  if (reach !== undefined && reach.scope === null) return [];
  const local =
    reach === undefined
      ? input.local
      : input.local.filter((candidate) => isMentionableIn({ reach, candidateId: candidate.id, selfId: input.selfId }));
  return [...local, ...input.remote].reduce<T[]>(
    (acc, candidate) =>
      candidate.id === input.selfId || acc.some((s) => s.id === candidate.id) ? acc : [...acc, candidate],
    []
  );
}
