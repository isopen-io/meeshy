import type { QueryClient } from '@tanstack/react-query';
import type { StoreApi } from 'zustand/vanilla';

import type { ConversationEncryptionChangedEventData } from '@meeshy/shared/types/socketio-events/conversation';

import { canSendPlaintext, type EndToEndRegimeState } from '@/lib/end-to-end-regime-ledger';

import { conversationQueryKey } from './conversations';
import { applyEncryptionAnnounced } from './realtime-encryption-regime';

/**
 * **LA BASCULE DU CHIFFREMENT EN TEMPS RÉEL** (`conversation:encryption-changed`,
 * #12522) — le web l'écoute pour FERMER, jamais pour rouvrir (#12949). Une
 * activation pose le mode sur la liste et le détail et, pour le bout en bout,
 * l'inscrit au registre du compte (`applyEncryptionAnnounced`). Une bascule à
 * `null` ne quitte que le chiffrement au repos : elle relit le détail, sauf
 * pour une conversation vue chiffrée de bout en bout, qui ne repasse jamais en
 * clair — une telle annonce est ignorée.
 */
const MODES = new Set(['e2ee', 'server', 'hybrid']);

export function isEncryptionChanged(payload: unknown): payload is ConversationEncryptionChangedEventData {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  const modeIsKnown = p.mode === null || (typeof p.mode === 'string' && MODES.has(p.mode));
  return typeof p.conversationId === 'string' && typeof p.epoch === 'number' && Number.isInteger(p.epoch) && modeIsKnown;
}

export function applyEncryptionChanged(
  queryClient: QueryClient,
  ledger: StoreApi<EndToEndRegimeState>,
  change: ConversationEncryptionChangedEventData,
): void {
  if (change.mode !== null) {
    applyEncryptionAnnounced(queryClient, change.conversationId, change.mode, ledger);
    return;
  }
  if (!canSendPlaintext({ conversationId: change.conversationId }, ledger.getState())) return;
  void queryClient.invalidateQueries({ queryKey: conversationQueryKey(change.conversationId), exact: true });
}
