import type { FriendRequestRecord } from '@/lib/api/friend-requests';
import type { MentionCandidate } from '@/lib/api/mention-suggestions';
import type { Message } from '@/lib/api/types';
import { friendsOf } from '@/lib/conversation-new/candidates';

import { participantAvatarOf } from './conversation';

/**
 * LES LOIS PURES DE LA MENTION AU COMPOSEUR (#7826) — miroir de
 * `ComposerMentionQuery` (`packages/MeeshySDK/.../Story/ComposerMentionQuery.swift`)
 * et de `MentionComposerController.swift` (filtre local, fusion, seuil).
 *
 * UN ÉCART ASSUMÉ avec iOS : la requête se lit AU CURSEUR, pas en fin de
 * texte. Sur iOS le curseur d'un `TextField` est presque toujours en fin de
 * champ ; sur le web, on revient corriger une phrase à la souris ou aux
 * flèches, et `bonjour @al| et au revoir` doit proposer Alice exactement
 * comme `bonjour @al|`.
 *
 * Le reste est la MÊME règle :
 * - un `@` n'ouvre une mention qu'en DÉBUT DE MOT (début du champ ou après
 *   une espace) — `contact@exemple.com` n'ouvre rien ;
 * - un pseudo est fait de lettres, de chiffres, de `_`, `.` et `-` ;
 * - au-delà de 32 caractères, ce n'est plus une frappe mais un collage ;
 * - l'insertion écrit `@username ` — l'espace finale rend la main à la
 *   phrase.
 */

export type MentionQuery = {
  /** Ce qui est tapé entre le `@` et le curseur. */
  readonly query: string;
  /** L'index du `@`. */
  readonly start: number;
  /** La fin du MOT sous le curseur — ce que l'insertion remplace. */
  readonly end: number;
};

const MAX_QUERY_LENGTH = 32;
const OPEN_BEFORE_CARET = new RegExp(`(?:^|\\s)@([\\p{L}\\p{N}_.-]{0,${MAX_QUERY_LENGTH}})$`, 'u');
const HANDLE_AFTER_CARET = /^[\p{L}\p{N}_.-]*/u;

/** À partir de combien de caractères la passerelle est interrogée —
 * `MentionLookupRule.minimumRemoteQueryLength` (iOS). Sous ce seuil, les
 * expéditeurs locaux sont la réponse complète. */
export const MIN_REMOTE_QUERY_LENGTH = 2;

/** Le plus grand nombre de rangées rendues. La liste est BORNÉE en hauteur
 * (`mention-suggestions.tsx`) et défile : elle ne masque pas le fil, mais
 * les contacts passant en tête (#7846), une borne à huit aurait caché tous
 * les participants d'un fil derrière le carnet d'adresses. */
export const MENTION_SUGGESTION_LIMIT = 24;

export function activeMentionQuery(text: string, caret: number): MentionQuery | null {
  if (caret < 0 || caret > text.length) return null;
  const match = OPEN_BEFORE_CARET.exec(text.slice(0, caret));
  const typed = match?.[1];
  if (typed === undefined) return null;
  const rest = HANDLE_AFTER_CARET.exec(text.slice(caret))?.[0] ?? '';
  return { query: typed, start: caret - typed.length - 1, end: caret + rest.length };
}

export function insertMention(
  text: string,
  query: MentionQuery,
  username: string,
): { readonly text: string; readonly caret: number } {
  const after = text.slice(query.end);
  const spaced = /^\s/u.test(after);
  const inserted = `@${username}${spaced ? '' : ' '}`;
  return {
    text: `${text.slice(0, query.start)}${inserted}${after}`,
    caret: query.start + inserted.length + (spaced ? 1 : 0),
  };
}

export const queriesRemote = (query: string): boolean => query.trim().length >= MIN_REMOTE_QUERY_LENGTH;

const nonBlank = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
};

function candidateOf(message: Message): MentionCandidate | null {
  const sender = message.sender;
  if (sender === undefined || sender.type === 'anonymous') return null;
  const username = nonBlank(sender.user?.username);
  if (username === undefined) return null;
  const avatar = participantAvatarOf(sender);
  return {
    id: sender.userId ?? message.senderId,
    username,
    displayName: nonBlank(sender.displayName) ?? nonBlank(sender.user?.displayName) ?? username,
    ...(avatar === undefined ? {} : { avatar }),
  };
}

/**
 * LES CANDIDATS LOCAUX — les expéditeurs DISTINCTS des messages chargés,
 * hors soi, le plus RÉCENT d'abord (on mentionne d'abord qui vient de
 * parler). Ils répondent SANS réseau, dès le `@` nu. Un invité anonyme n'a
 * pas de pseudo public : il ne se mentionne pas.
 */
export function localMentionCandidates(messages: readonly Message[], selfId: string | null): readonly MentionCandidate[] {
  return [...messages].reverse().reduce<readonly MentionCandidate[]>((acc, message) => {
    const candidate = candidateOf(message);
    if (candidate === null || candidate.id === selfId || acc.some((known) => known.id === candidate.id)) return acc;
    return [...acc, candidate];
  }, []);
}

const folded = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase();

export function filterMentionCandidates(
  candidates: readonly MentionCandidate[],
  query: string,
): readonly MentionCandidate[] {
  const needle = folded(query.trim());
  if (needle === '') return candidates;
  return candidates.filter(
    (candidate) => folded(candidate.username).includes(needle) || folded(candidate.displayName).includes(needle),
  );
}

/**
 * LE RANG D'UNE CORRESPONDANCE (#7846) — dès la première lettre, la liste
 * locale se TRIE autant qu'elle se filtre : `@a` met Anna (le pseudo commence
 * par `a`) devant Bernard Alain (un mot du nom commence par `a`), et l'un et
 * l'autre devant Malik (le `a` est au milieu). `null` : aucune
 * correspondance.
 */
function matchRank(candidate: MentionCandidate, needle: string): number | null {
  const handle = folded(candidate.username);
  const name = folded(candidate.displayName);
  if (handle.startsWith(needle)) return 0;
  if (name.split(/\s+/u).some((word) => word.startsWith(needle))) return 1;
  if (handle.includes(needle) || name.includes(needle)) return 2;
  return null;
}

export function rankMentionCandidates(
  candidates: readonly MentionCandidate[],
  query: string,
): readonly MentionCandidate[] {
  const needle = folded(query.trim());
  if (needle === '') return candidates;
  return candidates
    .flatMap((candidate, index) => {
      const rank = matchRank(candidate, needle);
      return rank === null ? [] : [{ candidate, rank, index }];
    })
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ candidate }) => candidate);
}

/**
 * LA FUSION — les groupes dans l'ordre reçu, chacun privé de ce que les
 * précédents ont déjà rendu, par identifiant OU par pseudo (sans casse).
 * Soi-même n'est jamais proposé, quelle que soit la source.
 */
export function mergeMentionCandidates(input: {
  readonly groups: readonly (readonly MentionCandidate[])[];
  readonly selfId: string | null;
}): readonly MentionCandidate[] {
  return input.groups.flat().reduce<readonly MentionCandidate[]>((acc, candidate) => {
    const handle = candidate.username.toLocaleLowerCase();
    const duplicate = acc.some((known) => known.id === candidate.id || known.username.toLocaleLowerCase() === handle);
    return candidate.id === input.selfId || duplicate ? acc : [...acc, candidate];
  }, []);
}

/**
 * LA LISTE DE MENTIONS, COMPOSÉE (#7846 — règle du porteur) : les CONTACTS
 * d'abord (on mentionne d'abord qui l'on connaît), puis les PARTICIPANTS du
 * contexte (conversation, publication), puis les AUTRES que la recherche
 * distante a trouvés. Les deux groupes locaux sont filtrés ET triés sous le
 * doigt (`rankMentionCandidates`) ; les distants gardent l'ordre de la
 * passerelle, qui trouve aussi sur des champs que le client ne voit pas.
 */
export function composeMentionList(input: {
  readonly contacts: readonly MentionCandidate[];
  readonly participants: readonly MentionCandidate[];
  readonly remote: readonly MentionCandidate[];
  readonly query: string;
  readonly selfId: string | null;
}): readonly MentionCandidate[] {
  const groups = [rankMentionCandidates(input.contacts, input.query), rankMentionCandidates(input.participants, input.query), input.remote];
  return mergeMentionCandidates({ groups, selfId: input.selfId }).slice(0, MENTION_SUGGESTION_LIMIT);
}

type MentionablePerson = {
  readonly id: string;
  readonly username?: string | null;
  readonly displayName?: string | null;
  readonly avatar?: string | null;
};

function candidateOfPerson(person: MentionablePerson): MentionCandidate | null {
  const username = nonBlank(person.username);
  if (username === undefined) return null;
  const avatar = nonBlank(person.avatar);
  return {
    id: person.id,
    username,
    displayName: nonBlank(person.displayName) ?? username,
    ...(avatar === undefined ? {} : { avatar }),
  };
}

/**
 * DES PERSONNES EN CANDIDATS (#7846) — l'auteur d'une publication et ses
 * commentateurs, dans l'ordre reçu : distincts, sans soi, et sans qui n'a
 * pas de pseudo (on ne peut pas insérer `@` + rien).
 */
export function peopleMentionCandidates(
  people: readonly MentionablePerson[],
  selfId: string | null,
): readonly MentionCandidate[] {
  return people.reduce<readonly MentionCandidate[]>((acc, person) => {
    const candidate = candidateOfPerson(person);
    if (candidate === null || candidate.id === selfId || acc.some((known) => known.id === candidate.id)) return acc;
    return [...acc, candidate];
  }, []);
}

/**
 * LES CONTACTS EN CANDIDATS (#7846) — l'autre partie de chaque amitié
 * acceptée, par `friendsOf` (le site UNIQUE qui la résout, celui de
 * « Nouvelle conversation »), marquée `friend` : la rangée porte la même
 * pastille « Contact » que celle que la passerelle aurait servie.
 */
export function contactMentionCandidates(
  accepted: readonly FriendRequestRecord[],
  viewerId: string | null,
): readonly MentionCandidate[] {
  return friendsOf({ accepted, viewerId }).flatMap((person) => {
    const candidate = candidateOfPerson(person);
    return candidate === null ? [] : [{ ...candidate, badge: 'friend' as const }];
  });
}
