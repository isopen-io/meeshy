package me.meeshy.sdk.story

import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.friend.OutboxFlushScheduler
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.StoryReactionPayload
import javax.inject.Inject
import javax.inject.Singleton

/** Ce que le POST direct d'une réaction de story est devenu (iOS `StoryReactionLedger.deliver`). */
sealed interface StoryReactionDelivery {
    /** Le serveur l'a posée. */
    data object Delivered : StoryReactionDelivery

    /** Panne de transport : la file durable la rejouera au retour du réseau, l'emoji affiché reste vrai. */
    data object Queued : StoryReactionDelivery

    /** Le serveur a refusé (ou la file n'a pas pu la garder) : l'état d'avant le tap doit revenir. */
    data class Refused(val httpStatus: Int?, val limitReached: Boolean) : StoryReactionDelivery
}

/** Le geste de réaction, sans savoir comment il part : en ligne, ou mis en file ([StoryReactionDispatch]). */
fun interface StoryReactionPublisher {
    suspend fun publish(storyId: String, emoji: String): StoryReactionDelivery
}

/**
 * Réagir à une story : POST direct d'abord ; une PANNE de transport (aucune réponse) met la réaction dans l'outbox
 * ([OutboxKind.REACT_STORY]) au lieu de la rembobiner ; un REFUS du serveur (409 `REACTION_LIMIT_REACHED`, 403, 404…)
 * se rend tel quel, rejouer ne changerait rien.
 */
@Singleton
class StoryReactionDispatch internal constructor(
    private val send: suspend (storyId: String, emoji: String) -> StoryReactionOutcome,
    private val enqueue: suspend (OutboxMutation) -> String?,
    private val schedule: () -> Unit,
) : StoryReactionPublisher {
    @Inject
    constructor(
        stories: StoryRepository,
        outbox: OutboxRepository,
        flush: OutboxFlushScheduler,
    ) : this(
        send = { id, emoji -> stories.reactOutcome(id, emoji) },
        enqueue = { outbox.enqueue(it) },
        schedule = { flush.schedule() },
    )

    override suspend fun publish(storyId: String, emoji: String): StoryReactionDelivery =
        when (val outcome = send(storyId, emoji)) {
            StoryReactionOutcome.Applied -> StoryReactionDelivery.Delivered
            is StoryReactionOutcome.Refused ->
                StoryReactionDelivery.Refused(outcome.httpStatus, outcome.isLimitReached)
            is StoryReactionOutcome.TransportFailure -> queue(storyId, emoji)
        }

    private suspend fun queue(storyId: String, emoji: String): StoryReactionDelivery = try {
        val cmid = enqueue(
            OutboxMutation(
                kind = OutboxKind.REACT_STORY,
                lane = OutboxLanes.SOCIAL,
                targetId = storyId,
                payload = MeeshyApi.json.encodeToString(StoryReactionPayload.serializer(), StoryReactionPayload(emoji)),
            ),
        )
        if (cmid == null) {
            StoryReactionDelivery.Refused(httpStatus = null, limitReached = false)
        } else {
            schedule()
            StoryReactionDelivery.Queued
        }
    } catch (e: CancellationException) {
        throw e
    } catch (_: Exception) {
        StoryReactionDelivery.Refused(httpStatus = null, limitReached = false)
    }
}
