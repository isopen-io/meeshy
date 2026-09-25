import * as z from 'zod/mini';

import type { MentionSuggestion } from '@meeshy/shared/types/mention';

import type { ConversationsDeps } from './conversations';
import type { ApiResult } from './http';

/**
 * LE PORT DES SUGGESTIONS DE MENTION (#7826) — `GET
 * /api/v1/mentions/suggestions?contextId=<conversation>&contextType=conversation&query=<q>`
 * (`services/gateway/src/routes/mentions.ts:47`, `requireAuth`), miroir de
 * `MentionService.suggestions(contextId:contextType:query:)` qu'appelle
 * `MentionComposerController.swift`.
 *
 * La route CONTEXTUELLE, jamais l'annuaire : elle classe d'elle-même les
 * membres de la conversation, puis les amis, puis le reste (`badge`), ce que
 * `/directory/people` ne sait pas faire. `query` est bornée à 64 caractères
 * par la passerelle (`SuggestionsQuerySchema`) ; la requête d'un composeur
 * ne dépasse jamais 32 (`activeMentionQuery`).
 *
 * **Un résultat décodé est une PROJECTION** (motif `decodePerson`) : ni
 * `inConversation` ni `isFriend` ne passent — `badge` les dit déjà —, un
 * `displayName` blanc retombe sur le pseudo, un `avatar` blanc est OMIS
 * (jamais un `<img src="">`), et une ligne sans identifiant ou sans pseudo
 * est écartée : on ne peut pas insérer `@` + rien.
 */

export type MentionBadge = MentionSuggestion['badge'];

export type MentionCandidate = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly avatar?: string;
  readonly badge?: MentionBadge;
};

const BADGES: readonly MentionBadge[] = ['conversation', 'friend', 'other'];

const optionalText = z.optional(z.nullable(z.string()));

const WireSuggestion = z.object({
  id: z.string().check(z.minLength(1)),
  username: z.string().check(z.minLength(1)),
  displayName: optionalText,
  avatar: optionalText,
  badge: z.optional(z.unknown()),
});

const nonBlank = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
};

const badgeOf = (raw: unknown): MentionBadge | undefined => BADGES.find((badge) => badge === raw);

export function decodeMentionSuggestion(raw: unknown): MentionCandidate | null {
  const parsed = WireSuggestion.safeParse(raw);
  if (!parsed.success) return null;
  const { id, username, displayName, avatar, badge } = parsed.data;
  const photo = nonBlank(avatar);
  const rank = badgeOf(badge);
  return {
    id,
    username,
    displayName: nonBlank(displayName) ?? username,
    ...(photo === undefined ? {} : { avatar: photo }),
    ...(rank === undefined ? {} : { badge: rank }),
  };
}

/**
 * LE CONTEXTE D'UNE MENTION (#7846) — les deux que la route sait classer
 * (`SuggestionsQuerySchema.contextType`) : une conversation (ses membres
 * d'abord) ou une publication (son auteur et ses commentateurs d'abord). Un
 * champ qui n'a ni l'un ni l'autre — une publication pas encore publiée —
 * passe par l'annuaire (`users-search.ts`), jamais par cette route.
 */
export type MentionContext = { readonly type: 'conversation' | 'post'; readonly id: string };

export async function fetchMentionSuggestions(
  deps: ConversationsDeps,
  params: { readonly context: MentionContext; readonly query: string; readonly signal?: AbortSignal },
): Promise<ApiResult<readonly MentionCandidate[]>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: [] };
  const contextId = encodeURIComponent(params.context.id);
  const query = encodeURIComponent(params.query);
  const result = await deps.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/mentions/suggestions?contextId=${contextId}&contextType=${params.context.type}&query=${query}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  const candidates = (Array.isArray(result.data) ? result.data : []).flatMap((raw) => {
    const decoded = decodeMentionSuggestion(raw);
    return decoded === null ? [] : [decoded];
  });
  return { ...result, data: candidates };
}
