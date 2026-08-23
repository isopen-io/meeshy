/**
 * SyncEngine unifié — miroir WEB de `SyncSeqState` (SDK iOS,
 * `packages/MeeshySDK/Sources/MeeshySDK/Sync/SyncSeqState.swift`).
 *
 * Le gateway tamponne un numéro de séquence monotone PER-USER sur les émissions
 * Socket.IO user-scoped (`emitWithSeq`, `services/gateway/src/socketio/utils/`)
 * sous la clé `_seq`. Le client applique l'event en temps réel ET avance son
 * curseur : un event qui arrive avec `next > lastSeq + 1` prouve que les events
 * `lastSeq+1 .. next-1` ont été manqués.
 *
 * C'est une détection EXACTE, là où le gap recovery temporel (watermarks
 * `updatedSince` / `after`) rate les events à timestamp identique et sur-fetch.
 *
 * Ce module est une VALEUR PURE — même règle, même ordre (`detectGap` AVANT
 * `record`), même no-op sur l'absence de `_seq` (gateway antérieur) que le SDK
 * iOS et le SDK Android
 * (`apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/sync/SyncSeqState.kt`).
 * Ce n'est pas une seconde interprétation de la règle : toute évolution touche
 * les TROIS fichiers.
 */

export type SyncSeqState = {
  /** Dernier `_seq` observé, `null` avant tout event. */
  readonly lastSeq: number | null;
};

export const initialSyncSeqState: SyncSeqState = Object.freeze({ lastSeq: null });

/**
 * `true` si `next` est en avance de plus d'UN cran sur le dernier seq observé
 * (⇒ events manqués). Ne rapporte JAMAIS un gap sur le tout premier event
 * (aucun point de référence) ni sur un seq `<= lastSeq` (doublon socket /
 * réordonnancement — pas un trou en avant). Requête pure : n'avance pas l'état.
 */
export function detectSyncSeqGap(state: SyncSeqState, next: number): boolean {
  if (state.lastSeq === null) return false;
  return next > state.lastSeq + 1;
}

/**
 * Avance le curseur au `seq` observé. Monotone : on n'écrase jamais avec une
 * valeur inférieure — un event réordonné ne doit pas faire régresser le curseur
 * et re-déclencher un faux gap au prochain event.
 */
export function recordSyncSeq(state: SyncSeqState, seq: number): SyncSeqState {
  if (state.lastSeq !== null && seq <= state.lastSeq) return state;
  return { lastSeq: seq };
}

export type SyncSeqObservation = {
  readonly state: SyncSeqState;
  readonly gap: boolean;
};

/**
 * Observe le `_seq` brut d'un payload socket : détecte le gap AVANT d'avancer
 * le curseur, puis l'avance. Un payload sans `_seq` — ou dont la valeur n'est
 * pas un nombre fini — est un NO-OP qui ne rapporte pas de gap : le gateway
 * émet délibérément sans `_seq` quand l'allocation échoue ou traîne, et un
 * gateway antérieur n'en émet aucun. Traiter ce cas comme un trou déclencherait
 * une resync sur un chemin dégradé parfaitement normal.
 */
export function observeSyncSeq(state: SyncSeqState, seq: unknown): SyncSeqObservation {
  if (typeof seq !== 'number' || !Number.isFinite(seq)) return { state, gap: false };
  const gap = detectSyncSeqGap(state, seq);
  return { state: recordSyncSeq(state, seq), gap };
}
