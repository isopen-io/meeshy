package me.meeshy.sdk.story

import androidx.work.WorkManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.firstOrNull
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.outbox.OutboxCapacity
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.outbox.OutboxOutcome
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.post.UnsentCommentStore
import javax.inject.Inject
import javax.inject.Singleton

/** L'issue d'un commentaire de story confié à la file durable (iOS `sendComment` + `returnRefusedStoryComment`). */
sealed interface StoryCommentPublication {
    /** La passerelle a accepté le commentaire ; sa ligne servie arrive par l'écho temps réel. */
    data object Delivered : StoryCommentPublication

    /** La file n'a pas pris le commentaire (pleine, compte clos) : il n'est confié à personne, le composeur le reprend. */
    data class Refused(val text: String) : StoryCommentPublication

    /** Le serveur a renoncé après avoir pris le commentaire : la ligne reste, en échec, avec son réessai. */
    data object Failed : StoryCommentPublication

    /** Remplacé ou annulé avant son départ : rien à réconcilier. */
    data object Dropped : StoryCommentPublication
}

/**
 * **Publier un commentaire de story par la file durable** : écrit sous le `cmid` de sa ligne (rejeu sans doublon), parti dès
 * le retour du réseau, observé jusqu'à son issue. Une story est un post : même route, même sender (`CREATE_COMMENT`).
 * Le texte que l'expéditeur a gardé sur l'appareil à l'épuisement ([UnsentCommentStore]) est repris ici : le composeur de
 * la story est l'écran qui le rend, il ne doit pas ressurgir ailleurs.
 */
@Singleton
class StoryCommentPublisher @Inject constructor(
    private val posts: PostRepository,
    private val outbox: OutboxRepository,
    private val unsent: UnsentCommentStore,
    private val workManager: WorkManager,
) {
    suspend fun publish(
        storyId: String,
        text: String,
        parentId: String?,
        originalLanguage: String?,
        attachmentIds: List<String>? = null,
        effectFlags: Int? = null,
        place: SharedPlace? = null,
    ): StoryCommentPublication {
        val cmid = queue(storyId, text, parentId, originalLanguage, attachmentIds, effectFlags, place)
            ?: return StoryCommentPublication.Refused(text)
        workManager.enqueue(OutboxFlushWorker.buildRequest())
        return when (val outcome = outbox.outcomeFor(cmid).firstOrNull()) {
            is OutboxOutcome.Succeeded -> StoryCommentPublication.Delivered
            is OutboxOutcome.Exhausted -> exhausted(storyId, text, outcome)
            is OutboxOutcome.Superseded, is OutboxOutcome.Cancelled, null -> StoryCommentPublication.Dropped
        }
    }

    private suspend fun queue(
        storyId: String,
        text: String,
        parentId: String?,
        originalLanguage: String?,
        attachmentIds: List<String>?,
        effectFlags: Int?,
        place: SharedPlace?,
    ): String? =
        try {
            posts.queueComment(storyId, text, parentId, originalLanguage, attachmentIds, effectFlags, place)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }

    private fun exhausted(storyId: String, text: String, outcome: OutboxOutcome.Exhausted): StoryCommentPublication {
        unsent.take(storyId)
        return if (outcome.reason == OutboxCapacity.REASON_QUEUE_FULL) StoryCommentPublication.Refused(text) else StoryCommentPublication.Failed
    }
}
