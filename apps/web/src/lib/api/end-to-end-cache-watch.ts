import type { QueryClient } from '@tanstack/react-query';
import type { StoreApi } from 'zustand/vanilla';

import { isEndToEndMode, type EndToEndRegimeState } from '@/lib/end-to-end-regime-ledger';

import { CONVERSATIONS_QUERY_KEY } from './conversations';

/**
 * **CE QUE LE CACHE DES CONVERSATIONS A SERVI e2ee, LE COMPTE L'A VU** (#12949)
 * — une conversation servie chiffrée de bout en bout dans la LISTE ou le
 * DÉTAIL est inscrite au registre du compte (`end-to-end-regime-ledger.ts`),
 * même jamais ouverte : une relecture servie ensuite sans mode ne la rouvre
 * plus au clair (transfert, feuille d'envoi, partage entrant).
 *
 * Seules deux formes sont lues : la page de liste (`pages[].conversations[]`,
 * clé `['conversations']`) et le détail (`['conversations', id]`, une
 * conversation dont l'`id` est la clé). Toute autre donnée rangée sous ce
 * préfixe est ignorée.
 */
type Row = { readonly id?: unknown; readonly encryptionMode?: unknown };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null;

const endToEndIds = (rows: readonly unknown[]): readonly string[] =>
  rows.flatMap((row) => {
    const candidate = row as Row;
    return isRecord(row) && typeof candidate.id === 'string' && isEndToEndMode(typeof candidate.encryptionMode === 'string' ? candidate.encryptionMode : null) ? [candidate.id] : [];
  });

function servedEndToEnd(queryKey: readonly unknown[], data: unknown): readonly string[] {
  if (queryKey[0] !== CONVERSATIONS_QUERY_KEY[0] || !isRecord(data)) return [];
  if (queryKey.length === 1 && Array.isArray(data.pages)) {
    return endToEndIds(data.pages.flatMap((page: unknown) => (isRecord(page) && Array.isArray(page.conversations) ? page.conversations : [])));
  }
  if (queryKey.length === 2 && typeof queryKey[1] === 'string' && data.id === queryKey[1]) return endToEndIds([data]);
  return [];
}

export function watchEndToEndConversations(queryClient: QueryClient, ledger: StoreApi<EndToEndRegimeState>): () => void {
  const cache = queryClient.getQueryCache();
  const learn = (queryKey: readonly unknown[], data: unknown): void =>
    servedEndToEnd(queryKey, data).forEach((id) => ledger.getState().learnEndToEnd(id));
  cache.getAll().forEach((query) => learn(query.queryKey, query.state.data));
  return cache.subscribe((event) => {
    if (event.type === 'added' || event.type === 'updated') learn(event.query.queryKey, event.query.state.data);
  });
}
