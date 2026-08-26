package me.meeshy.sdk.sync

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * SyncEngine unifié — état PUR de suivi du numéro de séquence monotone per-user
 * (`_seq`) que le gateway tamponne sur les émissions Socket.IO user-scoped
 * (`emitWithSeq`, `services/gateway/src/socketio/utils/emitWithSeq.ts`).
 *
 * Le client applique l'event en temps réel ET avance son curseur : un event qui
 * arrive avec `next > lastSeq + 1` prouve que les events `lastSeq+1 .. next-1`
 * ont été manqués. C'est une détection EXACTE, là où le gap recovery temporel
 * (watermarks `updatedSince` / `after`) rate les events à timestamp identique et
 * sur-fetch.
 *
 * **Troisième miroir** de la MÊME règle : iOS
 * `packages/MeeshySDK/Sources/MeeshySDK/Sync/SyncSeqState.swift` et web
 * `apps/web/lib/sync/sync-seq-state.ts`. Détecter AVANT d'enregistrer, jamais de
 * gap au premier event, jamais de régression du curseur, absence de `_seq` =
 * no-op. Ce n'est pas une troisième interprétation de la règle : toute évolution
 * touche les TROIS fichiers — une divergence fabriquerait des faux trous sur une
 * plateforme et des trous manqués sur une autre.
 */
public data class SyncSeqState(
    /** Dernier `_seq` observé, `null` avant tout event. */
    public val lastSeq: Long? = null,
) {
    /**
     * `true` si [next] est en avance de plus d'UN cran sur le dernier seq observé
     * (⇒ events manqués). Ne rapporte JAMAIS un gap sur le tout premier event
     * (aucun point de référence) ni sur un seq `<= lastSeq` (doublon socket /
     * réordonnancement — pas un trou en avant). Requête pure : n'avance pas l'état.
     */
    public fun detectGap(next: Long): Boolean {
        val last = lastSeq ?: return false
        return next > last + 1
    }

    /**
     * Avance le curseur au [seq] observé. Monotone : on n'écrase jamais avec une
     * valeur inférieure — un event réordonné ne doit pas faire régresser le
     * curseur et re-déclencher un faux gap au prochain event.
     */
    public fun record(seq: Long): SyncSeqState {
        val last = lastSeq
        if (last != null && seq <= last) return this
        return SyncSeqState(seq)
    }
}

/**
 * Porteur thread-safe de [SyncSeqState] + hook de gap — pendant Android de l'actor
 * iOS `SyncSeqTracker`.
 *
 * `observe` est appelé depuis le thread du client Socket.IO (le callback de
 * `MessageSocketManager.listen`, qui ne suspend jamais) : l'état est donc gardé
 * par un moniteur plutôt que par un actor/Mutex, pour rester non-suspendant sur
 * le chemin temps réel.
 *
 * SDK purity : le SDK expose le HOOK ([gapDetected]) ; la décision « que faire
 * d'un trou » vit app-side (`NotificationsViewModel`, miroir du coordinateur iOS
 * `NotificationGapResyncCoordinator`).
 */
@Singleton
public class SyncSeqTracker @Inject constructor() {

    private val lock = Any()
    private var state = SyncSeqState()

    private val _gapDetected = MutableSharedFlow<Long>(replay = 0, extraBufferCapacity = 16)

    /** Émet le `_seq` du trou détecté (la valeur de `next` qui a sauté). */
    public val gapDetected: SharedFlow<Long> = _gapDetected.asSharedFlow()

    /**
     * Observe un `_seq` : détecte le gap AVANT d'avancer le curseur, puis
     * l'avance, et émet sur [gapDetected] le cas échéant. Un `null` (event sans
     * `_seq`) est un NO-OP qui ne rapporte pas de gap : le gateway émet
     * délibérément sans `_seq` quand l'allocation du compteur rejette ou dépasse
     * son délai, et un gateway antérieur n'en émet aucun. Traiter ce cas comme un
     * trou déclencherait une resync sur un chemin dégradé parfaitement normal.
     */
    public fun observe(seq: Long?): Boolean {
        if (seq == null) return false
        val gap = synchronized(lock) {
            val detected = state.detectGap(seq)
            state = state.record(seq)
            detected
        }
        if (gap) _gapDetected.tryEmit(seq)
        return gap
    }

    public val lastSeq: Long? get() = synchronized(lock) { state.lastSeq }

    /**
     * Purge cross-compte au logout — miroir de `AuthManager` (iOS) et du
     * `disconnect()` du singleton web. `_seq` est alloué PAR USER et persiste
     * côté serveur : le curseur d'un compte ne veut rien dire pour le suivant.
     * Sans ce reset, le premier event du compte suivant serait comparé au curseur
     * du précédent — un faux trou s'il est plus haut, et surtout des trous
     * MANQUÉS tant que le nouveau compte n'a pas dépassé le curseur hérité.
     */
    public fun reset() {
        synchronized(lock) { state = SyncSeqState() }
    }
}
