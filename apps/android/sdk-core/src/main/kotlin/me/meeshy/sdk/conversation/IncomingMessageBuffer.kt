package me.meeshy.sdk.conversation

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.session.AccountTicket
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
 *
 * Une fenêtre appartient au compte du premier message reçu ([ticket], #13558) : [flush] reçoit ce ticket, et un message
 * reçu sous un autre compte abandonne ce que tenait la fenêtre de l'ancien — rien du compte parti n'atterrit sous le suivant.
 */
internal class IncomingMessageBuffer(
    private val scope: CoroutineScope,
    private val windowMillis: Long = DEFAULT_WINDOW_MILLIS,
    private val ticket: () -> AccountTicket? = { null },
    private val flush: suspend (List<ApiMessage>, AccountTicket?) -> Unit,
) {
    private val lock = Any()
    private val pending = LinkedHashMap<String, ApiMessage>()
    private var window: Job? = null
    private var windowTicket: AccountTicket? = null

    /** Ajoute [message] à la fenêtre courante, en l'ouvrant si besoin. */
    fun offer(message: ApiMessage) {
        val arrivedUnder = ticket()
        synchronized(lock) {
            if (pending.isNotEmpty() && windowTicket != arrivedUnder) {
                window?.cancel()
                window = null
                pending.clear()
            }
            if (pending.isEmpty()) windowTicket = arrivedUnder
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
        val (batch, owner) = synchronized(lock) {
            window = null
            (pending.values.toList() to windowTicket).also { pending.clear() }
        }
        if (batch.isEmpty()) return
        try {
            flush(batch, owner)
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
