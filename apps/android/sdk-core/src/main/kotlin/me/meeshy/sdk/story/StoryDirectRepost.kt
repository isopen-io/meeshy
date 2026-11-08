package me.meeshy.sdk.story

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.friend.OutboxFlushScheduler
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.story.StoryRepostDestination
import me.meeshy.sdk.model.story.StoryRepostFailure
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.RepostPayload
import me.meeshy.sdk.post.PostRepository
import java.util.concurrent.ConcurrentHashMap

/** Ce qu'une republication directe est devenue (iOS `RepostPublisher`). */
sealed interface StoryDirectRepostOutcome {
    /** La passerelle l'a publiée. */
    data object Published : StoryDirectRepostOutcome

    /** Pas de réseau : elle est en file et partira au retour du réseau (le geste est tenu pour fait). */
    data object Queued : StoryDirectRepostOutcome

    /** Une republication de cette même source est déjà en vol ou en file : le geste en double est avalé. */
    data object Duplicate : StoryDirectRepostOutcome

    data class Refused(val failure: StoryRepostFailure) : StoryDirectRepostOutcome
}

/** Le geste de republication, sans savoir comment il part : en ligne, ou mis en file ([StoryDirectRepost]). */
fun interface StoryRepostPublisher {
    suspend fun publish(storyId: String, destination: StoryRepostDestination): StoryDirectRepostOutcome
}

/**
 * **Republier une story d'un geste** (#15067, iOS `StoryDirectRepost` + `RepostPublisher`) : republication SÈCHE — la
 * passerelle hérite l'audience de l'original (ou la rétrécit, `StoryRepostAudience`) et fige le contenu d'une source
 * éphémère — vers la story, le post ou le réel.
 *
 * - **Jeton d'idempotence** : il naît avec l'INTENTION ([OutboxIds.cmid]) et voyage tel quel de la requête en ligne à
 *   la ligne de file, donc un rejeu ne republie jamais deux fois.
 * - **Hors ligne** : sans réponse du tout, la republication est mise en file et part au retour du réseau.
 * - **Verrou par cible** : tant qu'une republication de la même source n'est pas retombée, la suivante est avalée ;
 *   hors ligne, c'est la file qui retient (`hasUnsentRow`), et elle survit à la mort de l'application.
 */
@Singleton
class StoryDirectRepost internal constructor(
    private val send: suspend (storyId: String, targetType: String, cmid: String) -> NetworkResult<ApiPost>,
    private val adoptStory: suspend (ApiPost) -> Unit,
    private val hasUnsentRow: suspend (storyId: String) -> Boolean,
    private val enqueue: suspend (OutboxMutation) -> Unit,
    private val schedule: () -> Unit,
    private val newCmid: () -> String,
) : StoryRepostPublisher {
    @Inject
    constructor(
        posts: PostRepository,
        stories: StoryRepository,
        outbox: OutboxRepository,
        flush: OutboxFlushScheduler,
    ) : this(
        send = { id, type, cmid ->
            posts.repost(id, targetType = PostType.valueOf(type), clientMutationId = cmid)
        },
        adoptStory = { stories.adoptRepost(it) },
        hasUnsentRow = { outbox.hasUnsentRow(OutboxKind.REPOST_POST, it) },
        enqueue = { outbox.enqueue(it) },
        schedule = { flush.schedule() },
        newCmid = { OutboxIds.cmid() },
    )

    private val inFlight: MutableSet<String> = ConcurrentHashMap.newKeySet()

    override suspend fun publish(storyId: String, destination: StoryRepostDestination): StoryDirectRepostOutcome {
        if (!inFlight.add(storyId)) return StoryDirectRepostOutcome.Duplicate
        try {
            if (hasUnsentRow(storyId)) return StoryDirectRepostOutcome.Duplicate
            val cmid = newCmid()
            return when (val result = send(storyId, destination.targetType, cmid)) {
                is NetworkResult.Success -> {
                    adopt(destination, result.data)
                    StoryDirectRepostOutcome.Published
                }
                is NetworkResult.Failure ->
                    if (StoryRepostFailure.waitsForNetwork(result.error.httpStatus)) {
                        queue(storyId, destination, cmid)
                    } else {
                        StoryDirectRepostOutcome.Refused(StoryRepostFailure.classify(result.error.httpStatus))
                    }
            }
        } finally {
            inFlight.remove(storyId)
        }
    }

    private suspend fun adopt(destination: StoryRepostDestination, post: ApiPost) {
        if (destination != StoryRepostDestination.STORY) return
        try {
            adoptStory(post)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            Unit
        }
    }

    private suspend fun queue(storyId: String, destination: StoryRepostDestination, cmid: String): StoryDirectRepostOutcome {
        enqueue(
            OutboxMutation(
                kind = OutboxKind.REPOST_POST,
                lane = OutboxLanes.SOCIAL,
                targetId = storyId,
                payload = MeeshyApi.json.encodeToString(RepostPayload.serializer(), RepostPayload(targetType = destination.targetType)),
                cmid = cmid,
            ),
        )
        schedule()
        return StoryDirectRepostOutcome.Queued
    }
}
