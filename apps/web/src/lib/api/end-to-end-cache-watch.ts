import type { QueryClient } from '@tanstack/react-query';
import type { StoreApi } from 'zustand/vanilla';

import { isEndToEndMode, threadShowsEndToEnd, type EndToEndRegimeState } from '@/lib/end-to-end-regime-ledger';

import { sessionIdentityKey, type SessionStoreApi } from './session';


/**
 * **CE QUE LE CACHE DES CONVERSATIONS A SERVI e2ee, LE COMPTE L'A VU** (#12949)
 * — une conversation servie chiffrée de bout en bout dans la LISTE ou le
 * DÉTAIL est inscrite au registre du compte (`end-to-end-regime-ledger.ts`),
 * même jamais ouverte : une relecture servie ensuite sans mode ne la rouvre
 * plus au clair (transfert, feuille d'envoi, partage entrant).
 *
 * #12986 — et un FIL en cache qui porte un message chiffré de bout en bout
 * (`threadShowsEndToEnd`) l'y inscrit aussi : la conversation est celle de la
 * clé, même servie sans mode.
 *
 * Seules trois formes sont lues : la page de liste (`pages[].conversations[]`,
 * clé `['conversations']`), le détail (`['conversations', id]`, une
 * conversation dont l'`id` est la clé) et les pages d'un fil
 * (`['conversations', id, 'messages', …]`, `pages[].messages[]`). Toute autre
 * donnée rangée sous ce préfixe est ignorée.
 */
type Row = { readonly id?: unknown; readonly encryptionMode?: unknown };

/** `CONVERSATIONS_QUERY_KEY[0]` (`conversations.ts`), écrit ici pour que le client de requêtes qui pose cette surveillance n'en tire pas les décodeurs ; un témoin les tient égaux. */
export const CONVERSATIONS_KEY_ROOT = 'conversations';

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null;

const endToEndIds = (rows: readonly unknown[]): readonly string[] =>
  rows.flatMap((row) => {
    const candidate = row as Row;
    return isRecord(row) && typeof candidate.id === 'string' && isEndToEndMode(typeof candidate.encryptionMode === 'string' ? candidate.encryptionMode : null) ? [candidate.id] : [];
  });

const threadRows = (data: Readonly<Record<string, unknown>>): readonly Readonly<Record<string, unknown>>[] =>
  Array.isArray(data.pages)
    ? data.pages.flatMap((page: unknown) => (isRecord(page) && Array.isArray(page.messages) ? page.messages.filter(isRecord) : []))
    : [];

function servedEndToEnd(queryKey: readonly unknown[], data: unknown): readonly string[] {
  if (queryKey[0] !== CONVERSATIONS_KEY_ROOT || !isRecord(data)) return [];
  if (queryKey.length >= 3 && typeof queryKey[1] === 'string' && queryKey[2] === 'messages') {
    return threadShowsEndToEnd(threadRows(data)) ? [queryKey[1]] : [];
  }
  if (queryKey.length === 1 && Array.isArray(data.pages)) {
    return endToEndIds(data.pages.flatMap((page: unknown) => (isRecord(page) && Array.isArray(page.conversations) ? page.conversations : [])));
  }
  if (queryKey.length === 2 && typeof queryKey[1] === 'string' && data.id === queryKey[1]) return endToEndIds([data]);
  return [];
}

export function watchEndToEndConversations(queryClient: QueryClient, ledger: StoreApi<EndToEndRegimeState>): () => void {
  const cache = queryClient.getQueryCache();
  const learn = (queryKey: readonly unknown[], data: unknown): void => {
    const known = ledger.getState().sealed;
    if (queryKey.length >= 3 && typeof queryKey[1] === 'string' && known[queryKey[1]] === true) return;
    servedEndToEnd(queryKey, data).forEach((id) => ledger.getState().learnEndToEnd(id));
  };
  cache.getAll().forEach((query) => learn(query.queryKey, query.state.data));
  return cache.subscribe((event) => {
    if (event.type === 'added' || (event.type === 'updated' && event.action.type === 'success')) learn(event.query.queryKey, event.query.state.data);
  });
}

/**
 * LE REGISTRE SUIT LE COMPTE, AVANT LE CACHE (#12949, #12986) — lié au compte
 * restauré dès la construction du client, puis à chaque changement de compte.
 * Posé AVANT le client de requêtes, cet abonnement passe avant le sien : le
 * registre est déjà au compte qui arrive quand son cache rangé revient et que
 * la surveillance y lit des fils chiffrés.
 */
export function bindEndToEndRegimeToSession(session: SessionStoreApi, ledger: StoreApi<EndToEndRegimeState>): () => void {
  ledger.getState().bind(sessionIdentityKey(session.getState().session));
  return session.subscribe((state) => ledger.getState().bind(sessionIdentityKey(state.session)));
}
