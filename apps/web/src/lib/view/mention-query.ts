import type { MentionCandidate } from '@/lib/api/mention-suggestions';
import type { Message } from '@/lib/api/types';

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

/** Le plus grand nombre de rangées montrées : au-delà, la liste masquerait
 * le fil qu'on est en train de lire. */
export const MENTION_SUGGESTION_LIMIT = 8;

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
 * LA FUSION — les locaux EN TÊTE (une personne qui parle dans ce fil passe
 * avant une homonyme qu'on ne connaît pas), puis les distants qui n'y sont
 * pas déjà, par identifiant OU par pseudo (sans casse). Soi-même n'est
 * jamais proposé, quelle que soit la source.
 */
export function mergeMentionCandidates(input: {
  readonly locals: readonly MentionCandidate[];
  readonly remote: readonly MentionCandidate[];
  readonly selfId: string | null;
}): readonly MentionCandidate[] {
  return [...input.locals, ...input.remote].reduce<readonly MentionCandidate[]>((acc, candidate) => {
    const handle = candidate.username.toLocaleLowerCase();
    const duplicate = acc.some((known) => known.id === candidate.id || known.username.toLocaleLowerCase() === handle);
    return candidate.id === input.selfId || duplicate ? acc : [...acc, candidate];
  }, []);
}
