import type { ApiResult } from '@/lib/api/http';
import { endToEndRegimeLedger, endToEndSealed } from '@/lib/end-to-end-regime-ledger';

/**
 * **OUVRIR LA CONVERSATION NON CHIFFRÉE À CÔTÉ DU TÊTE-À-TÊTE CHIFFRÉ**
 * (#12966, décision porteur du 2026-10-25) — le bout en bout ne se désactive
 * pas (#12949) ; pour échanger en clair avec la même personne, la passerelle
 * tient un second tête-à-tête, celui qu'elle lit, et le rend (ou le crée) sur
 * `plaintext: true` (`createDirectConversation`).
 *
 * Elle ne mène JAMAIS dans un tête-à-tête chiffré — servi tel, ou VU tel par
 * ce compte (#12949) : une passerelle qui ne connaît pas encore la demande rend
 * le tête-à-tête existant — celui d'où l'on part — et y « ouvrir » la
 * conversation non chiffrée serait mentir.
 */
export type PlaintextDirectOutcome = 'opened' | 'failed' | 'offline';

export type PlaintextDirectPorts = {
  readonly online: () => boolean;
  readonly open: (peerId: string) => Promise<ApiResult<{ readonly id: string; readonly encryptionMode?: string | null }>>;
  readonly go: (conversationId: string) => void;
};

export async function openPlaintextDirect(
  ports: PlaintextDirectPorts,
  params: { readonly peerId: string; readonly fromConversationId: string },
): Promise<PlaintextDirectOutcome> {
  if (!ports.online()) return 'offline';
  const result = await ports.open(params.peerId).catch(() => null);
  if (result === null || !result.ok) return 'failed';
  const served = result.data;
  const sealed = endToEndSealed(endToEndRegimeLedger.getState(), { conversationId: served.id, servedMode: served.encryptionMode });
  if (served.id === params.fromConversationId || sealed) return 'failed';
  ports.go(served.id);
  return 'opened';
}

/**
 * LE GESTE D'UN TÊTE-À-TÊTE CHIFFRÉ DE BOUT EN BOUT, tel que la fiche le
 * reçoit — l'hôte le fournit quand il connaît le pair ; sans lui, rien n'est
 * promis (`plaintext-direct-gesture.ts`).
 */
export type PlaintextDirectGesture = {
  readonly peerName: string;
  readonly open: () => Promise<PlaintextDirectOutcome>;
};
