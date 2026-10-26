import type { QueryClient } from '@tanstack/react-query';
import type { StoreApi } from 'zustand/vanilla';

import { isEndToEndMode, type EndToEndRegimeState } from '@/lib/end-to-end-regime-ledger';
import { endToEndShownSince, threadHoldsSend, threadShowsEndToEnd, type ThreadShape } from '@/lib/end-to-end-thread-signal';


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
 * #13099 — un fil en cache qui montre un message chiffré sans mode, d'un mode
 * inconnu, ou un message e2ee dans un groupe RETIENT l'envoi tant qu'il le
 * montre (`threadHoldsSend`), sans rien inscrire au registre. La forme
 * (tête-à-tête ou groupe) est lue dans le cache de la conversation ; inconnue,
 * elle se lit « groupe » : retenir sans apprendre.
 *
 * #12992 — chaque inscription porte la plus ancienne preuve datée : la date
 * d'activation servie (`encryptionEnabledAt`), l'avis d'activation ou le
 * premier message e2ee du fil.
 *
 * Seules trois formes sont lues : la page de liste (`pages[].conversations[]`,
 * clé `['conversations']`), le détail (`['conversations', id]`, une
 * conversation dont l'`id` est la clé) et les pages d'un fil
 * (`['conversations', id, 'messages', …]`, `pages[].messages[]`). Toute autre
 * donnée rangée sous ce préfixe est ignorée.
 */
type Row = { readonly id?: unknown; readonly type?: unknown; readonly encryptionMode?: unknown; readonly encryptionEnabledAt?: unknown };

/** `CONVERSATIONS_QUERY_KEY[0]` (`conversations.ts`), écrit ici pour que le client de requêtes qui pose cette surveillance n'en tire pas les décodeurs ; un témoin les tient égaux. */
export const CONVERSATIONS_KEY_ROOT = 'conversations';

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null;

type Learned = { readonly id: string; readonly since: number | undefined };

const instantOf = (value: unknown): number | undefined => {
  if (!(value instanceof Date) && typeof value !== 'string') return undefined;
  const at = new Date(value).getTime();
  return Number.isFinite(at) ? at : undefined;
};

const endToEndRows = (rows: readonly unknown[]): readonly Learned[] =>
  rows.flatMap((row) => {
    const candidate = row as Row;
    return isRecord(row) && typeof candidate.id === 'string' && isEndToEndMode(typeof candidate.encryptionMode === 'string' ? candidate.encryptionMode : null)
      ? [{ id: candidate.id, since: instantOf(candidate.encryptionEnabledAt) }]
      : [];
  });

const listRows = (data: unknown): readonly unknown[] =>
  isRecord(data) && Array.isArray(data.pages)
    ? data.pages.flatMap((page: unknown) => (isRecord(page) && Array.isArray(page.conversations) ? page.conversations : []))
    : [];

const threadRows = (data: unknown): readonly Readonly<Record<string, unknown>>[] =>
  isRecord(data) && Array.isArray(data.pages)
    ? data.pages.flatMap((page: unknown) => (isRecord(page) && Array.isArray(page.messages) ? page.messages.filter(isRecord) : []))
    : [];

const isThreadKey = (queryKey: readonly unknown[]): queryKey is readonly [string, string, 'messages', ...unknown[]] =>
  queryKey[0] === CONVERSATIONS_KEY_ROOT && queryKey.length >= 3 && typeof queryKey[1] === 'string' && queryKey[2] === 'messages';

function servedEndToEnd(queryKey: readonly unknown[], data: unknown): readonly Learned[] {
  if (queryKey[0] !== CONVERSATIONS_KEY_ROOT || !isRecord(data)) return [];
  if (queryKey.length === 1 && Array.isArray(data.pages)) return endToEndRows(listRows(data));
  if (queryKey.length === 2 && typeof queryKey[1] === 'string' && data.id === queryKey[1]) return endToEndRows([data]);
  return [];
}

/** La forme de la conversation, lue dans son détail puis dans la liste ; inconnue ⇒ groupe. */
function shapeOf(queryClient: QueryClient, conversationId: string): ThreadShape {
  const detail = queryClient.getQueryData([CONVERSATIONS_KEY_ROOT, conversationId]);
  const fromDetail = isRecord(detail) && detail.id === conversationId ? detail.type : undefined;
  const listed = listRows(queryClient.getQueryData([CONVERSATIONS_KEY_ROOT])).find((row) => isRecord(row) && row.id === conversationId);
  const type = fromDetail ?? (isRecord(listed) ? listed.type : undefined);
  return { isDirect: type === 'direct' };
}

/** Un clair d'utilisateur, daté avant l'ère : ce que la photographie retient (#12992). */
const clearBefore = (row: Readonly<Record<string, unknown>>, since: number): string[] => {
  const at = instantOf(row.createdAt);
  const plain = row.isEncrypted !== true && row.messageType !== 'system' && row.messageSource !== 'system';
  return typeof row.id === 'string' && plain && at !== undefined && at < since ? [row.id] : [];
};

export function watchEndToEndConversations(queryClient: QueryClient, ledger: StoreApi<EndToEndRegimeState>): () => void {
  const cache = queryClient.getQueryCache();
  /**
   * #12992 (revue) — À L'INSTANT où la conversation est apprise e2ee, les clairs
   * déjà en cache sont photographiés : ce sont les seuls « d'avant l'activation »
   * que ce navigateur croira. Un clair servi ensuite, même antidaté, reste scellé.
   */
  const photograph = (state: EndToEndRegimeState): void => {
    Object.keys(state.sealed)
      .filter((id) => state.clearKnown[id] === undefined)
      .forEach((id) => {
        const since = state.since[id] ?? Number.POSITIVE_INFINITY;
        const rows = cache.findAll({ queryKey: [CONVERSATIONS_KEY_ROOT, id, 'messages'] }).flatMap((query) => threadRows(query.state.data));
        ledger.getState().rememberClearBefore(id, rows.flatMap((row) => clearBefore(row, since)));
      });
  };
  const unsubscribeLedger = ledger.subscribe(photograph);
  const watchThread = (conversationId: string): void => {
    const shape = shapeOf(queryClient, conversationId);
    const threads = cache.findAll({ queryKey: [CONVERSATIONS_KEY_ROOT, conversationId, 'messages'] }).map((query) => threadRows(query.state.data));
    const shown = threads.filter((rows) => threadShowsEndToEnd(rows, shape));
    if (shown.length > 0) {
      const instants = shown.map((rows) => endToEndShownSince(rows)).filter((at): at is number => at !== null);
      ledger.getState().learnEndToEnd(conversationId, instants.length === 0 ? undefined : Math.min(...instants));
    }
    ledger.getState().holdSend(conversationId, threads.some((rows) => threadHoldsSend(rows, shape)));
  };
  const learn = (queryKey: readonly unknown[], data: unknown): void => {
    if (isThreadKey(queryKey)) {
      watchThread(queryKey[1]);
      return;
    }
    servedEndToEnd(queryKey, data).forEach(({ id, since }) => ledger.getState().learnEndToEnd(id, since));
  };
  photograph(ledger.getState());
  cache.getAll().forEach((query) => learn(query.queryKey, query.state.data));
  const unsubscribeCache = cache.subscribe((event) => {
    if (event.type === 'added' || (event.type === 'updated' && event.action.type === 'success')) learn(event.query.queryKey, event.query.state.data);
    if (event.type === 'removed' && isThreadKey(event.query.queryKey)) watchThread(event.query.queryKey[1]);
  });
  return () => {
    unsubscribeCache();
    unsubscribeLedger();
  };
}
