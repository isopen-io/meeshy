import type { CallLiveFrameReply } from '@meeshy/shared/types/call-live-frame-bounds';
import { createStore, type StoreApi } from 'zustand/vanilla';

/**
 * **L'ÉTAT DU CADRE EN DIRECT** (#16943, loi 16) — ce que lisent l'écran
 * d'appel (la surface, la carte de proposition, la capsule de réponse) et le
 * mode Montage (l'interrupteur « Cadre »), et qu'écrit SEULE la session
 * (`call-live-frame.ts`). Rien n'est persisté : un nouvel appel repart sans cadre.
 */

/** Une proposition reçue : le cadre que l'autre m'invite à appliquer, et le prénom qu'il partage. */
export type LiveFrameProposal = { readonly frameId: string; readonly from: string | null };

/** Ce que l'autre a répondu à MA proposition. */
export type LiveFrameAnswer = { readonly frameId: string; readonly reply: CallLiveFrameReply; readonly from: string | null };

export type CallLiveFrameState = {
  readonly callId: string | null;
  /** Le cadre montré CHEZ MOI. */
  readonly frameId: string | null;
  readonly proposal: LiveFrameProposal | null;
  /** Une proposition reçue hors duo vidéo : gardée, jamais montrée, rendue au retour en duo vidéo (iOS `mayShowProposal`). */
  readonly withheld: LiveFrameProposal | null;
  /** Ma proposition qui attend sa réponse. */
  readonly sentProposal: string | null;
  readonly answer: LiveFrameAnswer | null;
  /** Le prénom que l'autre partage ; il remplace celui qu'on avait de lui dans le cadre. */
  readonly remoteSharedName: string | null;
  /** Le cadre que l'autre montre, quand il me l'a dit (proposé, ou accepté le mien). */
  readonly peerFrameId: string | null;
  /** Mon cadre est appliqué chez moi mais la passerelle a refusé de le proposer. */
  readonly notice: 'not-proposed' | null;
};

export type CallLiveFrameStoreApi = StoreApi<CallLiveFrameState>;

export const NO_LIVE_FRAME: CallLiveFrameState = { callId: null, frameId: null, proposal: null, withheld: null, sentProposal: null, answer: null, remoteSharedName: null, peerFrameId: null, notice: null };

export function createCallLiveFrameStore(): CallLiveFrameStoreApi {
  return createStore<CallLiveFrameState>(() => NO_LIVE_FRAME);
}

export const callLiveFrameStore = createCallLiveFrameStore();
