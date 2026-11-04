package me.meeshy.sdk.socket

import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.SocialReactionOutcome
import me.meeshy.sdk.model.SocketCommentReactionSyncData
import me.meeshy.sdk.model.SocketCommentReactionUpdateData
import me.meeshy.sdk.model.SocketPostReactionSyncData
import me.meeshy.sdk.model.SocketPostReactionUpdateData
import me.meeshy.sdk.model.socket.SocketAck
import me.meeshy.sdk.model.socket.SocketAckPayloadSource
import me.meeshy.sdk.model.socket.SocketEventNames
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Les réactions de post et de commentaire émises sur la socket UNIQUE, avec accusé (miroir d'iOS `addPostReaction`,
 * `removePostReaction`, `requestPostReactionSync` et leurs jumelles commentaire). La confirmation du serveur remplace
 * l'état optimiste ; un refus (dont `DAILY_REACTION_LIMIT`) est rendu tel quel pour que l'appelant l'annule.
 */
@Singleton
class SocialReactionEmitter internal constructor(
    private val acks: SocketAckEmitter,
    private val json: Json,
) {
    @Inject
    constructor(socketManager: SocketManager, json: Json) : this(SocketAckEmitter(socketManager), json)

    suspend fun addPostReaction(postId: String, emoji: String): SocialReactionOutcome<SocketPostReactionUpdateData> =
        reactToPost(SocketEventNames.POST_REACTION_ADD, postId, emoji, "add")

    suspend fun removePostReaction(postId: String, emoji: String): SocialReactionOutcome<SocketPostReactionUpdateData> =
        reactToPost(SocketEventNames.POST_REACTION_REMOVE, postId, emoji, "remove")

    suspend fun requestPostReactionSync(postId: String): SocialReactionOutcome<SocketPostReactionSyncData> =
        emit(SocketEventNames.POST_REACTION_REQUEST_SYNC, JSONObject().put("postId", postId), SocketPostReactionSyncData.serializer()) {
            SocketPostReactionSyncData(postId)
        }

    suspend fun addCommentReaction(commentId: String, postId: String, emoji: String): SocialReactionOutcome<SocketCommentReactionUpdateData> =
        reactToComment(SocketEventNames.COMMENT_REACTION_ADD, commentId, postId, emoji, "add")

    suspend fun removeCommentReaction(commentId: String, postId: String, emoji: String): SocialReactionOutcome<SocketCommentReactionUpdateData> =
        reactToComment(SocketEventNames.COMMENT_REACTION_REMOVE, commentId, postId, emoji, "remove")

    suspend fun requestCommentReactionSync(commentId: String): SocialReactionOutcome<SocketCommentReactionSyncData> =
        emit(SocketEventNames.COMMENT_REACTION_REQUEST_SYNC, JSONObject().put("commentId", commentId), SocketCommentReactionSyncData.serializer()) {
            SocketCommentReactionSyncData(commentId)
        }

    private suspend fun reactToPost(event: String, postId: String, emoji: String, action: String) =
        emit(event, JSONObject().put("postId", postId).put("emoji", emoji), SocketPostReactionUpdateData.serializer()) {
            SocketPostReactionUpdateData(postId = postId, emoji = emoji, action = action)
        }

    private suspend fun reactToComment(event: String, commentId: String, postId: String, emoji: String, action: String) =
        emit(event, JSONObject().put("commentId", commentId).put("postId", postId).put("emoji", emoji), SocketCommentReactionUpdateData.serializer()) {
            SocketCommentReactionUpdateData(commentId = commentId, postId = postId, userId = "", emoji = emoji, action = action)
        }

    private suspend fun <T : Any> emit(
        event: String,
        payload: JSONObject,
        serializer: KSerializer<T>,
        whenUnreadable: () -> T,
    ): SocialReactionOutcome<T> {
        val ack: SocketAck<T> = acks.emitWithAck(event, payload, ACK_TIMEOUT_MS, SocketAckPayloadSource.DATA) { data: JsonObject ->
            json.decodeFromJsonElement(serializer, data)
        }
        return SocialReactionOutcome.from(ack, whenUnreadable)
    }

    private companion object {
        const val ACK_TIMEOUT_MS = 10_000L
    }
}
