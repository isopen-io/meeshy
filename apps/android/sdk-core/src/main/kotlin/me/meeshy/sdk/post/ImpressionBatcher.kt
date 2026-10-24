package me.meeshy.sdk.post

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.analytics.ContentSurface
import me.meeshy.sdk.model.analytics.ImpressionSource
import me.meeshy.sdk.model.analytics.SocialEvent
import me.meeshy.sdk.model.analytics.SocialEventStamp
import me.meeshy.sdk.model.analytics.StampedSocialEvent
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult

/**
 * Groupe les impressions d'une surface en petits lots et les envoie par `POST /social/events`
 * ([deliver], la porte unique de la télémétrie de lecture) — port du `ImpressionBatcher` iOS.
 * Une impression compte par APPARITION : [record] n'écarte jamais une répétition, mais chaque
 * apparition reçoit son enveloppe ([SocialEventStamp]) dès son enregistrement. Un rejeu renvoie
 * donc les MÊMES `eventId`, que la passerelle déduplique, et la file de réessai n'en garde qu'un
 * exemplaire.
 *
 * Un refus définitif (4xx hors 401/408/429, ou un succès illisible que le serveur a déjà compté)
 * n'est jamais remis en file (#12483) : le rejouer ne changerait pas la réponse et la file grossissait
 * à chaque essai. Le réseau, les 5xx, la limitation et l'expiration de session restent rejouables.
 *
 * Une instance par surface, possédée par son ViewModel. [scope] a son PROPRE `SupervisorJob`, pas
 * `viewModelScope` : le [flushNowAsync] de `onCleared()` courrait sinon contre sa propre annulation.
 * La persistance hors processus et le flush au passage en arrière-plan d'iOS ne sont pas portés.
 */
class ImpressionBatcher(
    private val source: ImpressionSource,
    private val surface: ContentSurface?,
    private val deliver: suspend (List<StampedSocialEvent>) -> NetworkResult<*>,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
    private val flushDelayMillis: Long = 3_000L,
    private val nowMillis: () -> Long = System::currentTimeMillis,
) {
    private val lock = Any()
    private var pending: List<StampedSocialEvent> = emptyList()
    private var flushJob: Job? = null

    /** [postId] vient d'apparaître à l'écran. */
    fun record(postId: String) {
        if (postId.isEmpty()) return
        val impression = StampedSocialEvent(
            event = SocialEvent.Impression(postId = postId, source = source.wire, surface = surface),
            stamp = SocialEventStamp.minted(nowMillis()),
        )
        synchronized(lock) { pending = (pending + impression).takeLast(PENDING_CAP) }
        scheduleFlush()
    }

    /** Envoie aussitôt ce qui attend — à appeler quand la surface disparaît. */
    suspend fun flushNow() {
        flushJob?.cancel()
        flushJob = null
        flush()
    }

    /** [flushNow] sans attente, pour les sites non suspendus comme `ViewModel.onCleared()`. */
    fun flushNowAsync() {
        scope.launch { flushNow() }
    }

    private fun scheduleFlush() {
        flushJob?.cancel()
        flushJob = scope.launch {
            delay(flushDelayMillis)
            flush()
        }
    }

    private suspend fun flush() {
        val batch = synchronized(lock) { pending.also { pending = emptyList() } }
        if (batch.isEmpty()) return
        val unsent = send(batch)
        if (unsent.isEmpty()) return
        synchronized(lock) {
            pending = (unsent + pending).distinctBy { it.stamp.eventId }.takeLast(PENDING_CAP)
        }
    }

    /** Rend ce qui doit être rejoué : le reste du lot à partir du premier paquet en échec transitoire. */
    private suspend fun send(batch: List<StampedSocialEvent>): List<StampedSocialEvent> {
        batch.chunked(SOCIAL_EVENTS_CAP).forEachIndexed { index, chunk ->
            val failure = attempt(chunk) ?: return@forEachIndexed
            if (!isPermanentRejection(failure)) return batch.drop(index * SOCIAL_EVENTS_CAP)
        }
        return emptyList()
    }

    private suspend fun attempt(chunk: List<StampedSocialEvent>): ApiError? = try {
        (deliver(chunk) as? NetworkResult.Failure)?.error
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (error: Exception) {
        ApiError(message = error.message ?: "delivery failed")
    }

    companion object {
        /** Le plafond d'un lot de `POST /social/events`. */
        const val SOCIAL_EVENTS_CAP = 200

        /** Une longue panne ne fait pas enfler la file au-delà : les plus anciennes partent. */
        const val PENDING_CAP = 500

        private val REPLAYABLE_CLIENT_ERRORS = setOf(401, 408, 429)

        fun isPermanentRejection(error: ApiError): Boolean {
            val status = error.httpStatus
            if (status == null) return error.code == "PARSE"
            return status in 400..499 && status !in REPLAYABLE_CLIENT_ERRORS
        }
    }
}
