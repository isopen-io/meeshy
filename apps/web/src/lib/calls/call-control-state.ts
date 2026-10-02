import type { CallControlErrorCode, CallReactionEmoji } from '@meeshy/shared/types/call-control-law';
import { createStore, type StoreApi } from 'zustand/vanilla';

/**
 * **CE QUE LES CONTRÔLES D'UN APPEL MONTRENT** (#8433, #8438, #8439) — deux
 * petits magasins qu'écrit le moteur (`engine-controls.ts`) et que lit l'écran
 * d'appel, hors de `ActiveCall` : une réaction qui passe ne repeint pas tout
 * l'écran, et un mot bref (« Nadia a coupé votre micro ») ne vit pas dans
 * l'état de l'appel.
 *
 * Les RÈGLES des réactions sont ici aussi, pures : combien s'affichent à la
 * fois, combien de temps, et le débit que le client s'impose AVANT la
 * passerelle (`SOCKET_RATE_LIMITS.CALL_REACTION` : 5 par seconde — le client
 * s'arrête à 4, pour qu'aucune réaction affichée chez lui ne soit refusée
 * chez les autres).
 */

export const REACTION_LIFETIME_MS = 2_500;
export const REACTION_MAX_SHOWN = 6;
export const REACTION_WINDOW_MS = 1_000;
export const REACTION_MAX_PER_WINDOW = 4;

export type CallReactionBurst = {
  readonly id: number;
  readonly emoji: CallReactionEmoji;
  /** `null` : la mienne. */
  readonly userId: string | null;
  /** Position horizontale, de 0 à 1, pour que deux réactions ne se couvrent pas. */
  readonly lane: number;
};

export type CallReactionState = { readonly bursts: readonly CallReactionBurst[] };

export type CallControlNotice =
  | { readonly kind: 'muted-by'; readonly byUserId: string }
  | { readonly kind: 'invite-failed'; readonly code: CallControlErrorCode; readonly name: string }
  | { readonly kind: 'mute-failed'; readonly code: CallControlErrorCode; readonly name: string }
  | { readonly kind: 'remove-failed'; readonly name: string }
  | { readonly kind: 'invite-declined'; readonly name: string }
  | { readonly kind: 'invite-unanswered'; readonly name: string };

export type CallNoticeState = { readonly notice: CallControlNotice | null; readonly seq: number };

export type CallReactionStoreApi = StoreApi<CallReactionState>;
export type CallNoticeStoreApi = StoreApi<CallNoticeState>;

export const createCallReactionStore = (): CallReactionStoreApi => createStore<CallReactionState>(() => ({ bursts: [] }));
export const createCallNoticeStore = (): CallNoticeStoreApi => createStore<CallNoticeState>(() => ({ notice: null, seq: 0 }));

export const callReactionStore = createCallReactionStore();
export const callNoticeStore = createCallNoticeStore();

/** La plus ancienne cède sa place au-delà de `REACTION_MAX_SHOWN`. */
export const withBurst = (bursts: readonly CallReactionBurst[], burst: CallReactionBurst): readonly CallReactionBurst[] => [...bursts, burst].slice(-REACTION_MAX_SHOWN);

export const withoutBurst = (bursts: readonly CallReactionBurst[], id: number): readonly CallReactionBurst[] => bursts.filter((burst) => burst.id !== id);

/** Les envois encore dans la fenêtre de débit. */
export const recentSends = (sentAt: readonly number[], now: number): readonly number[] => sentAt.filter((at) => now - at < REACTION_WINDOW_MS);

export const reactionAllowed = (sentAt: readonly number[], now: number): boolean => recentSends(sentAt, now).length < REACTION_MAX_PER_WINDOW;

/** Une voie déterministe entre 0,15 et 0,85 : les réactions successives s'écartent. */
export const laneOf = (seq: number): number => 0.15 + ((seq * 37) % 71) / 100;

export function showNotice(store: CallNoticeStoreApi, notice: CallControlNotice): void {
  store.setState({ notice, seq: store.getState().seq + 1 });
}

export function dismissNotice(store: CallNoticeStoreApi): void {
  store.setState({ ...store.getState(), notice: null });
}
