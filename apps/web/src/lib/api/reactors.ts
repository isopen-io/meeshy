import * as reactionsEndpoints from '@meeshy/shared/api/endpoints/reactions';

import type { ConversationsDeps } from './conversations';
import type { ApiResult } from './http';

/**
 * QUI A RÉAGI (#10583) — `GET /reactions/:messageId`
 * (`services/gateway/src/routes/reactions.ts`, `requiredAuth`
 * `allowAnonymous: true`, réservée aux participants de la conversation) : la
 * liste nominative que « Plus… » et l'appui long sur une pilule affichent.
 * Miroir `ReactionSyncResponse` / `ReactionGroup` (`MeeshyReaction.swift`).
 *
 * LES COMPTES NE VIENNENT PAS D'ICI. `Message.reactionSummary` les porte déjà,
 * tenu à jour par le temps réel : la feuille les peint tout de suite et cette
 * lecture n'y ajoute que les NOMS. `api/reactions-mine.ts` reste vrai — le
 * chargement d'un fil ne lit toujours pas cette route ; elle ne part qu'au
 * geste qui demande les noms.
 *
 * RIEN N'EST FABRIQUÉ (dimension 1) : un réacteur dont la passerelle ne sert
 * pas le nom n'a pas de ligne, et un refus (403, 404) est rendu tel quel. La
 * charge est relue champ par champ — c'est une frontière de confiance.
 */
export type Reactor = { readonly name: string; readonly avatar: string | null };

export type ReactorGroup = { readonly emoji: string; readonly reactors: readonly Reactor[] };

export const messageReactorsQueryKey = (messageId: string) => ['message-reactors', messageId] as const;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null;

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value !== '';

function reactorOf(candidate: unknown): readonly Reactor[] {
  if (!isRecord(candidate) || !nonEmpty(candidate.username)) return [];
  return [{ name: candidate.username, avatar: nonEmpty(candidate.avatar) ? candidate.avatar : null }];
}

function groupOf(candidate: unknown): readonly ReactorGroup[] {
  if (!isRecord(candidate) || !nonEmpty(candidate.emoji)) return [];
  const users = Array.isArray(candidate.users) ? candidate.users : [];
  return [{ emoji: candidate.emoji, reactors: users.flatMap(reactorOf) }];
}

export function parseReactorGroups(data: unknown): readonly ReactorGroup[] {
  if (!isRecord(data) || !Array.isArray(data.reactions)) return [];
  return data.reactions.flatMap(groupOf);
}

export async function fetchMessageReactors(
  params: ConversationsDeps & { readonly messageId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<readonly ReactorGroup[]>> {
  if (__FIXTURES__ && params.source === 'fixtures') return { ok: true, data: [], status: 200 };
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: reactionsEndpoints.byMessageId(params.messageId),
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  return { ...result, data: parseReactorGroups(result.data) };
}
