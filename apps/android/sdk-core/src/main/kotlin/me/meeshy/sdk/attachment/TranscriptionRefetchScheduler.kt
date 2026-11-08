package me.meeshy.sdk.attachment

import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.TranscriptionRetryScheduler
import timber.log.Timber

/**
 * LA relecture unique d'un vocal qui n'a pas sa transcription (miroir de `TranscriptionRetryScheduler`, iOS) :
 * `transcription:ready` arrive d'ordinaire tout seul, mais si Whisper n'avait pas fini à la réponse REST et que la
 * trame s'est perdue, UNE relecture part [TranscriptionRetryScheduler.SINGLE_RETRY_DELAY_MS] après l'ouverture
 * (`listAround`, [TranscriptionRetryScheduler.REFETCH_WINDOW] messages, traductions comprises) et fusionne ce que le
 * serveur sert. Bornée (un id, une lecture), annulable (le [Job] rendu), jamais rejouée en boucle : aucune liste n'est
 * gardée ici, c'est l'appelant qui décide quoi planifier et une seule fois.
 */
class TranscriptionRefetchScheduler(
    private val refresh: suspend (conversationId: String, messageId: String, limit: Int) -> Boolean,
    private val delayMs: Long = TranscriptionRetryScheduler.SINGLE_RETRY_DELAY_MS,
) {

    @Inject
    constructor(messages: MessageRepository) : this({ conversationId, messageId, limit ->
        messages.refreshAround(conversationId, messageId, limit)
    })

    /** Planifie la relecture de [messageIds] ; `null` quand il n'y a rien à lire. Annuler le [Job] annule tout. */
    fun schedule(conversationId: String, messageIds: List<String>, scope: CoroutineScope): Job? {
        val ids = messageIds.filter { it.isNotBlank() }.distinct()
        if (ids.isEmpty()) return null
        return scope.launch {
            delay(delayMs)
            ids.forEach { id -> readAround(conversationId, id) }
        }
    }

    private suspend fun readAround(conversationId: String, messageId: String) {
        try {
            refresh(conversationId, messageId, TranscriptionRetryScheduler.REFETCH_WINDOW)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
            Timber.w("Transcription refetch: lecture non appliquee (%s)", failure.javaClass.simpleName)
        }
    }
}
