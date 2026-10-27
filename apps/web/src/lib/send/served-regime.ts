import type { QueryClient } from '@tanstack/react-query';

import { canSendPlaintext, isEndToEndMode } from '@/lib/end-to-end-regime-ledger';

/**
 * **LE RÉGIME QUE LE CACHE A SERVI, SANS ATTENDRE LA SURVEILLANCE** (#13171,
 * audit) — la surveillance du cache (`api/end-to-end-cache-watch.ts`) inscrit
 * au registre ce que la liste et le détail servent e2ee, mais elle vit dans un
 * chunk chargé après la première peinture : un envoi au démarrage à froid,
 * ou vers une conversation que le registre n'a pas encore vue, lit ici le mode
 * servi lui-même. Clés écrites à la main (`['conversations']`,
 * `['conversations', id]`) pour ne pas tirer les décodeurs des conversations.
 */
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null;

const listedRows = (data: unknown): readonly unknown[] =>
  isRecord(data) && Array.isArray(data.pages) ? data.pages.flatMap((page: unknown) => (isRecord(page) && Array.isArray(page.conversations) ? page.conversations : [])) : [];

export type ServedRegime = { readonly known: boolean; readonly endToEnd: boolean };

export function servedRegimeOf(queryClient: QueryClient, conversationId: string): ServedRegime {
  const rows = [queryClient.getQueryData(['conversations', conversationId]), ...listedRows(queryClient.getQueryData(['conversations']))].filter(
    (row): row is Readonly<Record<string, unknown>> => isRecord(row) && row.id === conversationId,
  );
  return { known: rows.length > 0, endToEnd: rows.some((row) => isEndToEndMode(typeof row.encryptionMode === 'string' ? row.encryptionMode : null)) };
}

/** L'envoi d'un clair vers cette conversation est-il retenu (#12949, #13171) ? Registre du compte, ou mode servi en cache. */
export function plaintextWithheld(conversationId: string, queryClient?: QueryClient): boolean {
  const served = queryClient === undefined ? null : servedRegimeOf(queryClient, conversationId);
  return !canSendPlaintext({ conversationId, servedMode: served?.endToEnd === true ? 'e2ee' : null });
}

/**
 * Une réponse rapide (refus d'appel par message) ne part que vers une
 * conversation dont ce navigateur CONNAÎT le régime, en clair : inconnue du
 * cache, elle pourrait être chiffrée de bout en bout — fail-closed (#13171).
 */
export function quickReplyAllowed(conversationId: string, queryClient: QueryClient): boolean {
  return servedRegimeOf(queryClient, conversationId).known && !plaintextWithheld(conversationId, queryClient);
}
