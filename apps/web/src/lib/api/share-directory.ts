import * as communitiesEndpoints from '@meeshy/shared/api/endpoints/communities';
import * as conversationsEndpoints from '@meeshy/shared/api/endpoints/conversations';

import type { ConversationsDeps } from './conversations';
import type { ApiResult } from './http';
import type { Conversation } from './types';

/**
 * CE QUE L'ÉCRAN DE PARTAGE DEMANDE AU SERVEUR, EN PLUS DES CACHES (#10948,
 * planche V5 et D11) — deux lectures, chacune sur une route qui existe :
 *
 * - `GET /conversations/search?q=` : les conversations du lecteur que la
 *   Lentille ne tient pas en cache (titre ou nom d'un participant) ;
 * - `GET /communities/mine` : le NOM des communautés dont il est membre, pour
 *   ranger sous elles les canaux où il peut écrire.
 *
 * Une ligne illisible est écartée, jamais une erreur ; un échec rend la liste
 * vide à l'appelant, qui garde son cache.
 */

const isConversation = (raw: unknown): raw is Conversation => {
  if (typeof raw !== 'object' || raw === null) return false;
  const row = raw as Record<string, unknown>;
  return typeof row['id'] === 'string' && typeof row['type'] === 'string' && Array.isArray(row['participants'] ?? []);
};

export async function searchConversations(deps: ConversationsDeps, query: string): Promise<ApiResult<readonly Conversation[]>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: [] };
  const result = await deps.transport.request<unknown>({ method: 'GET', path: `${conversationsEndpoints.search}?q=${encodeURIComponent(query)}` });
  if (!result.ok) return result;
  const rows = (Array.isArray(result.data) ? result.data : []).filter(isConversation).map((row) => ({ ...row, participants: row.participants ?? [] }));
  return { ok: true, data: rows };
}

export type MyCommunity = { readonly id: string; readonly name: string; readonly avatar: string | null };

const decodeMine = (raw: unknown): MyCommunity | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const id = row['id'];
  const name = row['name'];
  if (typeof id !== 'string' || typeof name !== 'string' || name.trim() === '') return null;
  return { id, name, avatar: typeof row['avatar'] === 'string' && row['avatar'] !== '' ? row['avatar'] : null };
};

export async function loadMyCommunities(deps: ConversationsDeps): Promise<ApiResult<readonly MyCommunity[]>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: [] };
  const result = await deps.transport.request<unknown>({ method: 'GET', path: communitiesEndpoints.mine });
  if (!result.ok) return result;
  return { ok: true, data: (Array.isArray(result.data) ? result.data : []).flatMap((raw) => {
    const community = decodeMine(raw);
    return community === null ? [] : [community];
  }) };
}

/** La clé du cache des communautés du lecteur — partagée, cinq minutes de fraîcheur comme l'annuaire. */
export const myCommunitiesQueryKey = ['communities', 'mine'] as const;
