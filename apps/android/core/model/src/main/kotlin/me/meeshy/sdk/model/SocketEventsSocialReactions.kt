package me.meeshy.sdk.model

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.feedback.DailyGestureLimit
import me.meeshy.sdk.model.socket.SocketAck

/** Accusé de `post:reaction-request-sync` : l'agrégat COMPLET des réactions d'un post (miroir d'iOS `SocketPostReactionSyncEvent`). */
@Serializable
data class SocketPostReactionSyncData(
    val postId: String,
    val reactions: List<SocketPostReactionAggregation> = emptyList(),
    val totalCount: Int = 0,
    val userReactions: List<String> = emptyList(),
)

/** Accusé de `comment:reaction-request-sync` (miroir d'iOS `SocketCommentReactionSyncEvent`). */
@Serializable
data class SocketCommentReactionSyncData(
    val commentId: String,
    val postId: String = "",
    val reactions: List<SocketCommentReactionAggregation> = emptyList(),
    val totalCount: Int = 0,
    val userReactions: List<String> = emptyList(),
)

/** L'issue d'une réaction émise avec accusé : le serveur confirme, ou refuse, ou ne répond pas. */
sealed interface SocialReactionOutcome<out T> {
    /** La confirmation du serveur : elle REMPLACE l'état optimiste. */
    data class Confirmed<out T>(val event: T) : SocialReactionOutcome<T>

    /** `DAILY_REACTION_LIMIT` : l'optimiste est annulé, « Limite du jour atteinte, retour à HH:mm ». */
    data class DailyLimit(val limit: DailyGestureLimit) : SocialReactionOutcome<Nothing>

    data class Refused(val code: String?, val message: String?) : SocialReactionOutcome<Nothing>

    data object NoSocket : SocialReactionOutcome<Nothing>

    data object TimedOut : SocialReactionOutcome<Nothing>

    companion object {
        /**
         * Lit un accusé. Une charge acceptée mais illisible est TOLÉRÉE : [whenUnreadable] reconstruit un événement
         * minimal SANS agrégat (jamais un compte à 0 qui effacerait le vrai) — le diffuseur rend l'agrégat autoritaire.
         */
        fun <T> from(ack: SocketAck<T>, whenUnreadable: () -> T): SocialReactionOutcome<T> = when (ack) {
            is SocketAck.Accepted -> Confirmed(ack.payload ?: whenUnreadable())
            SocketAck.Timeout -> TimedOut
            is SocketAck.Refused -> when {
                ack.refusal == me.meeshy.sdk.model.socket.SocketAckRefusal.NO_SOCKET -> NoSocket
                ack.refusal.dailyGestureLimit != null -> DailyLimit(ack.refusal.dailyGestureLimit!!)
                else -> Refused(ack.refusal.code, ack.refusal.message)
            }
        }
    }
}

/** Resynchronisation d'un agrégat : le compte absolu de CHAQUE emoji remplace le résumé, sans delta. */
object PostReactionSyncLaw {
    /** `null` : rien ne change (résumé déjà identique). Les comptes nuls ou négatifs et les emojis vides sont écartés. */
    fun applying(post: ApiPost, sync: SocketPostReactionSyncData): ApiPost? {
        val next = sync.reactions.filter { it.emoji.isNotBlank() && it.count > 0 }.associate { it.emoji to it.count }
        val current = post.reactionSummary.orEmpty()
        return if (next == current) null else post.copy(reactionSummary = next)
    }
}
