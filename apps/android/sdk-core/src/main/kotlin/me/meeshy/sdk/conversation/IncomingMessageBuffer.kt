package me.meeshy.sdk.conversation

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.ApiMessage
import timber.log.Timber

/**
 * Coalesce les rafales de `message:new` en UNE écriture par fenêtre — miroir de
 * `bufferIncomingAPIMessages` / `IncomingBatchReconciler` (iOS).
 *
 * Le premier message d'une fenêtre l'ouvre ; ceux qui arrivent pendant [windowMillis] la
 * rejoignent ; à l'échéance, [flush] reçoit le lot entier (une transaction, une notification).
 * Un même message reçu plusieurs fois dans la fenêtre n'y figure qu'une fois, dans son DERNIER
 * état, à la place de sa première arrivée. Un échec de [flush] est journalisé et isolé : il ne
 * ferme pas la fenêtre suivante.
 */
internal class IncomingMessageBuffer(
    private val scope: CoroutineScope,
    private val windowMillis: Long = DEFAULT_WINDOW_MILLIS,
    private val flush: suspend (List<ApiMessage>) -> Unit,
) {
    private val lock = Any()
    private val pending = LinkedHashMap<String, ApiMessage>()
    private var window: Job? = null

    /** Ajoute [message] à la fenêtre courante, en l'ouvrant si besoin. */
    fun offer(message: ApiMessage) {
        synchronized(lock) {
            pending.remove(message.id)
            pending[message.id] = message
            if (window?.isActive != true) window = scope.launch { delay(windowMillis); drain() }
        }
    }

    /** Abandonne la fenêtre en cours et ce qu'elle tenait (fin de session). */
    fun clear() {
        synchronized(lock) {
            window?.cancel()
            window = null
            pending.clear()
        }
    }

    private suspend fun drain() {
        val batch = synchronized(lock) {
            window = null
            pending.values.toList().also { pending.clear() }
        }
        if (batch.isEmpty()) return
        try {
            flush(batch)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            Timber.w(failure, "Ingestion de %d message(s) en échec", batch.size)
        }
    }

    companion object {
        /** Assez pour absorber une rafale de reconnexion, trop court pour être perçu. */
        const val DEFAULT_WINDOW_MILLIS: Long = 150L
    }
}
