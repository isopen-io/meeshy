/**
 * **LE CURSEUR `_seq` DU SYNCENGINE, OBSERVÉ PAR LE WEB** (#18601).
 *
 * La passerelle estampille d'un curseur monotone PAR COMPTE les émissions
 * user-scoped (`emitWithSeq`, `services/gateway/src/socketio/utils/emitWithSeq.ts`).
 * Le client avance son `lastSeq` ; un saut au-delà de `lastSeq + 1` prouve qu'il
 * a manqué des événements — une détection de trou EXACTE, supérieure à un
 * rattrapage temporel.
 *
 * **LE WEB ÉTAIT LA SEULE PLATEFORME À NE PAS L'OBSERVER** : iOS
 * (`SyncSeqTracker`, puis `NotificationGapResyncCoordinator`) et Android
 * (`syncSeqTracker` → `ChatResyncController`) le font depuis le cycle 163, et
 * trois doc-comments du dépôt affirmaient que le web aussi — en nommant
 * `notification-socketio.singleton.ts`, un fichier de l'application web LEGACY
 * sortie du dépôt au #7668.
 *
 * ─── LA CONDITION QUI REND CE CURSEUR SÛR, ET SA MESURE ──────────────────
 *
 * Le `_seq` est per-user **GLOBAL**, pas per-event : un client qui n'observe
 * qu'un SOUS-ENSEMBLE des événements estampillés voit un trou à chaque
 * événement non observé, et **un curseur observé partiellement est pire que pas
 * de curseur** — il fabrique des trous là où rien n'a été perdu, et chaque faux
 * trou coûte une resynchronisation.
 *
 * Mesuré le 2026-11-22 : `emitWithSeq` a **deux** sites d'appel dans toute la
 * passerelle, et tous deux émettent `notification:new`
 * (`NotificationService.ts`). Observer ce seul événement est donc une
 * observation COMPLÈTE, pas partielle. Ce n'est pas une hypothèse de confort :
 * c'est ce qui autorise ce lot, et le cliquet de lockstep
 * (`socket-seq-lockstep-gate`) rougit le jour où la passerelle estampille un
 * troisième site — c'est là que l'état se relit, jamais dans ce commentaire.
 *
 * ─── CE QUI N'EST PAS UN TROU ────────────────────────────────────────────
 *
 * Miroir exact de `SyncSeqState` (iOS) : le PREMIER événement ne peut pas être
 * un trou (aucun `lastSeq` connu), un doublon de socket ou un réordonnancement
 * (`seq <= lastSeq`) n'en est pas un non plus, et il ne fait pas reculer le
 * curseur. Seul un saut strictement au-delà de `lastSeq + 1` en est un.
 */

const SEQ_KEY = '_seq';

/** L'état PUR : ce que le lecteur a vu de plus haut, `null` avant le premier événement. */
export type SyncSeqState = { readonly lastSeq: number | null };

export const EMPTY_SYNC_SEQ: SyncSeqState = { lastSeq: null };

/**
 * Le curseur porté par une charge socket, ou `null` — une passerelle ANTÉRIEURE
 * n'en pose aucun, et un `_seq` qui n'est pas un entier positif ne dit rien :
 * dans les deux cas le lecteur n'apprend rien, il ne conclut surtout pas à un
 * trou.
 */
export function syncSeqOf(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const seq = (payload as Record<string, unknown>)[SEQ_KEY];
  return typeof seq === 'number' && Number.isInteger(seq) && seq > 0 ? seq : null;
}

/** Un saut au-delà de `lastSeq + 1` — et rien d'autre. */
export function detectSyncGap(state: SyncSeqState, next: number): boolean {
  return state.lastSeq !== null && next > state.lastSeq + 1;
}

/** Le curseur n'avance jamais à reculons : un doublon le laisse où il est. */
export function recordSyncSeq(state: SyncSeqState, next: number): SyncSeqState {
  return state.lastSeq === null || next > state.lastSeq ? { lastSeq: next } : state;
}

export type SyncSeqTracker = {
  /** La charge BRUTE, telle que la socket la remet — jamais la valeur décodée. */
  observe(payload: unknown): void;
  readonly lastSeq: number | null;
  reset(): void;
};

/**
 * **L'OBSERVATION SUIT LE FLUX SERVEUR, PAS LE SUCCÈS DU CONSOMMATEUR.** Le
 * tracker s'appelle AVANT la livraison de l'événement : le curseur avance même
 * si le décodage échoue ensuite, et même si aucun écran n'écoute. C'est la
 * règle que portent déjà les deux miroirs ; l'inverse fabriquerait un trou à
 * chaque charge mal formée, c'est-à-dire une resynchronisation à chaque bogue
 * d'affichage.
 *
 * `onGap` reçoit le curseur qui a RÉVÉLÉ le trou (celui de l'événement reçu),
 * et le curseur avance quand même : un trou se signale une fois, il ne se
 * répète pas à chaque événement suivant.
 */
export function createSyncSeqTracker(params: { readonly onGap: (seq: number) => void }): SyncSeqTracker {
  let state: SyncSeqState = EMPTY_SYNC_SEQ;
  return {
    observe(payload: unknown): void {
      const seq = syncSeqOf(payload);
      if (seq === null) return;
      const gap = detectSyncGap(state, seq);
      state = recordSyncSeq(state, seq);
      if (gap) params.onGap(seq);
    },
    get lastSeq(): number | null {
      return state.lastSeq;
    },
    reset(): void {
      state = EMPTY_SYNC_SEQ;
    },
  };
}
