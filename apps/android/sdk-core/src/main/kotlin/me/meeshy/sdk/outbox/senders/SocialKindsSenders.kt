package me.meeshy.sdk.outbox.senders

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.api.StoryApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.outbox.DeleteCommentPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxKindHandler
import me.meeshy.sdk.outbox.OutboxKindKey
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.ToggleLikeCommentPayload
import me.meeshy.sdk.outbox.withPayload
import me.meeshy.sdk.post.CommentGestureQueue
import me.meeshy.sdk.post.CommentGestureRollback
import javax.inject.Inject

/**
 * `MARK_STORY_VIEWED` : le « vu » d'une story, binaire et idempotent. Un refus définitif de la passerelle (story
 * disparue) épuise la ligne sans rejeu ; le reste suit le classeur commun.
 */
public class MarkStoryViewedHandler @Inject constructor(
    private val storyApi: StoryApi,
) : OutboxKindHandler {
    override suspend fun send(row: OutboxEntity): SendResult = apiCall { storyApi.markViewed(row.targetId) }.toToggleSendResult()
}

/**
 * `TOGGLE_LIKE_COMMENT` : pose ou retire le coeur voulu. Déjà appliqué (409, 410) = succès ; un refus définitif de la
 * passerelle épuise la ligne et l'écran défait son optimiste.
 */
public class ToggleLikeCommentHandler @Inject constructor(
    private val postApi: PostApi,
    private val json: Json,
    private val gestures: CommentGestureQueue,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<ToggleLikeCommentPayload>(row) { toggle ->
            val call = if (toggle.liked) apiCall { postApi.likeComment(toggle.postId, row.targetId) } else apiCall { postApi.unlikeComment(toggle.postId, row.targetId) }
            call.toToggleSendResult()
        }

    override suspend fun onExhausted(row: OutboxEntity) {
        val liked = runCatching { json.decodeFromString<ToggleLikeCommentPayload>(row.payload).liked }.getOrNull() ?: return
        gestures.rolledBack(CommentGestureRollback.Like(row.targetId, liked))
    }
}

/**
 * `DELETE_COMMENT` : un 404 de la passerelle dit que le commentaire n'existe déjà plus, c'est le but atteint ; un 403
 * (pas le sien) épuise la ligne et le commentaire revient.
 */
public class DeleteCommentHandler @Inject constructor(
    private val postApi: PostApi,
    private val json: Json,
    private val gestures: CommentGestureQueue,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<DeleteCommentPayload>(row) { delete ->
            val result = apiCall { postApi.deleteComment(delete.postId, row.targetId) }
            val failure = (result as? NetworkResult.Failure)?.error
            if (failure?.httpStatus == HTTP_NOT_FOUND && failure.code != "HTTP_$HTTP_NOT_FOUND") SendResult.Success else result.toToggleSendResult()
        }

    override suspend fun onExhausted(row: OutboxEntity) {
        gestures.rolledBack(CommentGestureRollback.Delete(row.targetId))
    }

    private companion object {
        const val HTTP_NOT_FOUND = 404
    }
}

/**
 * `REPOST_STORY` : le repost PRIVÉ d'une story dans une conversation. La passerelle n'expose pas encore de route pour
 * ce geste (iOS le range lui aussi à la mauvaise file) : la ligne reste en file, jamais rejouée à vide, épuisée avec sa raison.
 */
public class RepostStoryHandler @Inject constructor() : OutboxKindHandler {
    override suspend fun send(row: OutboxEntity): SendResult = SendResult.PermanentFailure("Private story repost: no gateway route")
}

@Module
@InstallIn(SingletonComponent::class)
public interface SocialKindsSendersModule {

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.MARK_STORY_VIEWED)
    public fun markStoryViewed(handler: MarkStoryViewedHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.TOGGLE_LIKE_COMMENT)
    public fun toggleLikeComment(handler: ToggleLikeCommentHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.DELETE_COMMENT)
    public fun deleteComment(handler: DeleteCommentHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.REPOST_STORY)
    public fun repostStory(handler: RepostStoryHandler): OutboxKindHandler
}
