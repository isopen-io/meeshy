import type { QueuedSend } from './send-queue';
import type { TargetStatus } from './send-sheet-run';

/**
 * LE TOAST APRÈS L'ENVOI (D5, #10949) — « Envoyé à Ana · Ouvrir », sans
 * navigation imposée. Pur : ce qu'un envoi terminé dit, et où « Ouvrir » mène.
 *
 * Seules les cibles CONVERSATION comptent (une publication n'a rien à
 * ouvrir) ; « Ouvrir » n'est offert que s'il n'y en a qu'une. Un envoi qui
 * attend encore ne dit rien ; un envoi dont une cible a ÉCHOUÉ le dit, feuille
 * fermée comprise — « Réessayer » seulement si l'échec est rejouable.
 */
export type SendToast =
  | { readonly kind: 'one'; readonly name: string; readonly conversationId: string }
  | { readonly kind: 'many'; readonly count: number }
  | { readonly kind: 'failed'; readonly count: number; readonly retryable: boolean };

const inFlight = (state: TargetStatus | undefined): boolean => state === undefined || state.state === 'idle' || state.state === 'queued' || state.state === 'sending';

export function sendToastOf(queued: QueuedSend): SendToast | null {
  const state = queued.run.getState();
  const statuses = state.order.map((key) => ({ key, status: state.statuses[key] }));
  if (state.phase !== 'done' || statuses.some(({ status }) => inFlight(status))) return null;
  const failed = statuses.flatMap(({ status }) => (status?.state === 'failed' ? [status.failure] : []));
  if (failed.length > 0) return { kind: 'failed', count: failed.length, retryable: failed.some((failure) => failure.kind !== 'refused') };
  const sent = statuses.flatMap(({ key, status }) => (status?.state === 'sent' && status.conversationId !== undefined ? [{ key, conversationId: status.conversationId }] : []));
  if (sent.length === 0) return statuses.length > 0 ? { kind: 'many', count: statuses.length } : null;
  const [only] = sent;
  if (sent.length === 1 && only !== undefined) return { kind: 'one', name: queued.labels[only.key] ?? '', conversationId: only.conversationId };
  return { kind: 'many', count: sent.length };
}
