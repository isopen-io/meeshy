package me.meeshy.sdk.sync

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * Le quota de 30 requêtes par minute que le gateway partage entre `mark-read` et `mark-as-received` :
 * une fenêtre glissante, comptée sur l'horloge injectée. Les deux chemins l'acquièrent avant de partir.
 */
@Singleton
public class ReceiptQuota @Inject constructor() {
    private val stamps = ArrayDeque<Long>()

    /** Vrai (et le créneau est pris) tant que moins de [LIMIT] requêtes sont parties dans la dernière minute. */
    @Synchronized
    public fun tryAcquire(nowMillis: Long): Boolean {
        while (stamps.isNotEmpty() && nowMillis - stamps.first() >= WINDOW_MILLIS) stamps.removeFirst()
        if (stamps.size >= LIMIT) return false
        stamps.addLast(nowMillis)
        return true
    }

    public companion object {
        public const val LIMIT: Int = 30
        public const val WINDOW_MILLIS: Long = 60_000
    }
}

/**
 * L'accusé de RÉCEPTION coalescé (miroir de `scheduleMarkAsReceived` iOS) : le PREMIER message d'une rafale arme une
 * fenêtre par conversation, les suivants tombent dessus et ne coûtent rien. La fenêtre se ferme AVANT l'envoi (un
 * message pendant l'aller-retour ouvre la suivante). Hors ligne, ou quota épuisé, l'accusé est abandonné sans erreur
 * visible : la livraison se rattrape au prochain message.
 */
public class ReceiptCoalescer(
    private val scope: CoroutineScope,
    private val quota: ReceiptQuota,
    private val isOnline: () -> Boolean,
    private val nowMillis: () -> Long,
    private val send: suspend (conversationId: String) -> Unit,
    private val windowMillis: Long = DEFAULT_WINDOW_MILLIS,
) {
    private val windows = HashMap<String, Job>()

    /** Un message d'un AUTRE est arrivé dans [conversationId]. */
    public fun onIncomingMessage(conversationId: String) {
        synchronized(windows) {
            if (windows.containsKey(conversationId)) return
            windows[conversationId] = scope.launch {
                delay(windowMillis)
                synchronized(windows) { windows.remove(conversationId) }
                dispatch(conversationId)
            }
        }
    }

    /** Annule toutes les fenêtres (déconnexion, détachement de la socket). */
    public fun cancelAll() {
        synchronized(windows) {
            windows.values.forEach { it.cancel() }
            windows.clear()
        }
    }

    private suspend fun dispatch(conversationId: String) {
        if (!isOnline()) return
        if (!quota.tryAcquire(nowMillis())) return
        try {
            send(conversationId)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            Timber.w(failure, "accusé de réception abandonné")
        }
    }

    public companion object {
        public const val DEFAULT_WINDOW_MILLIS: Long = 1_000
    }
}
