import { unwrap } from './client';
import type { DataSource } from './config';
import { decodeConversation } from './decode';
import { sharedConversationsWith } from './fixtures';
import type { ApiResult, HttpTransport } from './http';
import type { Conversation } from './types';

/**
 * **LES CONVERSATIONS EN COMMUN** (#7124) — miroir de
 * `ConversationService.listSharedWith` (`packages/MeeshySDK/Sources/MeeshySDK/
 * Services/ConversationService.swift:459`), que `UserProfileSheet` appelle
 * pour son onglet Conversations (`UserProfileSheet.swift:325`).
 *
 * `GET /api/v1/conversations?withUserId=<id>&limit=50` rend les conversations
 * dont le LECTEUR **et** le sujet sont tous deux membres actifs
 * (`services/gateway/src/routes/conversations/core-list.ts:193-210`). **Aucune
 * route à écrire** : le filtre existe depuis le premier jour d'iOS, et ce port
 * ne fait que le nommer côté web.
 *
 * ## Pourquoi un module à part, et pas `conversations.ts`
 *
 * La QUESTION n'est pas la même. `conversations.ts` sert LA Lentille — une
 * liste paginée, persistée, revalidée par le temps réel, dont la clé de cache
 * est la vie entière de l'écran d'accueil. Celle-ci est une lecture BORNÉE,
 * portée par un SUJET, qui ne se pagine pas et n'a aucun titre à entrer dans
 * la famille `['conversations']` — une invalidation de la Lentille rejouerait
 * sinon autant de requêtes que de fiches visitées.
 *
 * ## Pas de pagination, et c'est une décision
 *
 * iOS demande cinquante lignes et s'arrête là ; le nombre de conversations
 * partagées avec UNE personne est petit par construction. Un « Charger plus »
 * sur cette section promettrait une profondeur que la question n'a pas.
 */

export type SharedConversationsDeps = { readonly source: DataSource; readonly transport: HttpTransport };

/** Le plafond d'iOS (`listSharedWith(userId:limit:)`, défaut 50), repris tel
 * quel : deux clients qui demandent deux profondeurs différentes feraient dire
 * deux choses à la même section. */
export const SHARED_CONVERSATIONS_LIMIT = 50;

/** Portée par le SUJET, et HORS de la famille `['conversations']` — § module. */
export const sharedConversationsQueryKey = (userId: string) => ['profile', 'shared-conversations', userId] as const;

export async function loadSharedConversations(
  params: SharedConversationsDeps & { readonly userId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<readonly Conversation[]>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    return { ok: true, data: sharedConversationsWith(params.userId) };
  }
  const query = new URLSearchParams({ withUserId: params.userId, limit: String(SHARED_CONVERSATIONS_LIMIT) });
  const result = await params.transport.request<readonly Conversation[]>({
    method: 'GET',
    path: `/api/v1/conversations?${query.toString()}`,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  /* UNE LIGNE SANS IDENTIFIANT NE S'AFFICHE PAS — elle n'a pas d'adresse où
     mener, et une rangée qui ne mène nulle part est un contrôle qui ment
     (loi 4). On l'écarte plutôt que de refuser la section entière : ce que la
     charge porte de lisible reste utile. */
  return { ok: true, data: result.data.filter((row) => typeof row?.id === 'string' && row.id !== '').map(decodeConversation) };
}

/**
 * `staleTime` à 60 s — la même fenêtre que la fiche qui l'héberge
 * (`PUBLIC_PROFILE_STALE_TIME`). Deux valeurs différentes sur une même page
 * feraient clignoter une moitié pendant que l'autre se tait.
 */
export const SHARED_CONVERSATIONS_STALE_TIME = 60_000;

export function sharedConversationsQueryOptions(deps: SharedConversationsDeps & { readonly userId: string }) {
  return {
    queryKey: sharedConversationsQueryKey(deps.userId),
    staleTime: SHARED_CONVERSATIONS_STALE_TIME,
    retry: false,
    queryFn: ({ signal }: { readonly signal: AbortSignal }) => loadSharedConversations({ ...deps, signal }).then(unwrap),
  };
}
