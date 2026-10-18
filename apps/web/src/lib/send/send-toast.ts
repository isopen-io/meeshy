import type { QueuedSend } from './send-queue';
import { pendingKeysOf } from './send-sheet-run';

/**
 * LE TOAST APRÈS L'ENVOI (D5, #10949) — « Envoyé à Ana · Ouvrir », sans
 * navigation imposée. Pur : ce qu'un envoi terminé dit, et où « Ouvrir » mène.
 *
 * Seules les cibles CONVERSATION comptent (une publication n'a rien à
 * ouvrir) ; « Ouvrir » n'est offert que s'il n'y en a qu'une. Un envoi qui
 * attend encore ou dont une cible a échoué ne dit pas « Envoyé ».
 */
export type SendToast =
  | { readonly kind: 'one'; readonly name: string; readonly conversationId: string }
  | { readonly kind: 'many'; readonly count: number };

export function sendToastOf(queued: QueuedSend): SendToast | null {
  const state = queued.run.getState();
  if (state.phase !== 'done' || pendingKeysOf(state).length > 0) return null;
  const statuses = state.order.map((key) => ({ key, status: state.statuses[key] }));
  if (statuses.some(({ status }) => status?.state === 'failed')) return null;
  const sent = statuses.flatMap(({ key, status }) => (status?.state === 'sent' && status.conversationId !== undefined ? [{ key, conversationId: status.conversationId }] : []));
  if (sent.length === 0) return statuses.length > 0 ? { kind: 'many', count: statuses.length } : null;
  const [only] = sent;
  if (sent.length === 1 && only !== undefined) return { kind: 'one', name: queued.labels[only.key] ?? '', conversationId: only.conversationId };
  return { kind: 'many', count: sent.length };
}
