package me.meeshy.sdk.model.thread

import java.time.Instant
import me.meeshy.sdk.lang.PrismCandidate
import me.meeshy.sdk.lang.PrismTranslationResolver
import me.meeshy.sdk.model.ApiMessage

enum class ThreadReplyStatus { SENDING, SENT, FAILED }

/** Une réponse du fil de discussion d'un message, déjà servie dans la langue du lecteur. */
data class ThreadReply(
    val id: String,
    val clientMessageId: String?,
    val senderId: String?,
    val senderName: String?,
    val senderAvatarUrl: String?,
    val text: String,
    val createdAtMillis: Long,
    val isMine: Boolean,
    val status: ThreadReplyStatus,
)

/**
 * Projection d'un `ApiMessage` en réponse de fil (miroir de `ThreadRepliesLoader` iOS). Le texte descend
 * le Prisme par la fonction unique [PrismTranslationResolver] ; un message supprimé ou chiffré n'est
 * jamais rendu (fail-closed : null).
 */
object ThreadReplyMapper {

    fun fromApi(
        message: ApiMessage,
        currentUserId: String?,
        prism: List<String>,
        status: ThreadReplyStatus = ThreadReplyStatus.SENT,
    ): ThreadReply? {
        if (message.deletedAt != null || message.isCiphertext || message.isEndToEndSealed) return null
        val served = PrismTranslationResolver.resolve(
            originalLanguage = message.originalLanguage,
            candidates = message.translations
                .filter { it.isEncrypted != true }
                .map { PrismCandidate(it.targetLanguage, it.translatedContent) },
            preferredLanguages = prism,
        )
        val authorId = message.sender?.userId ?: message.senderId
        return ThreadReply(
            id = message.id,
            clientMessageId = message.clientMessageId,
            senderId = authorId,
            senderName = (message.sender?.displayName ?: message.sender?.username)?.trim()?.ifBlank { null },
            senderAvatarUrl = message.sender?.avatar,
            text = served?.text ?: message.content,
            createdAtMillis = message.createdAt?.let(::parseMillis) ?: 0L,
            isMine = currentUserId != null && authorId == currentUserId,
            status = status,
        )
    }

    private fun parseMillis(iso: String): Long? =
        try { Instant.parse(iso).toEpochMilli() } catch (_: Exception) { null }
}

/**
 * Les règles pures du fil : jamais d'écrasement d'une réponse optimiste, un échec réseau garde
 * l'existant (iOS `ThreadView.shouldApplyCacheSeed` + `loadReplies`).
 */
object ThreadReplies {

    const val PAGE_SIZE: Int = 50

    /** Le cache est un amorçage de démarrage à froid, jamais un remplacement. */
    fun shouldApplyCacheSeed(current: List<ThreadReply>, seeded: List<ThreadReply>): Boolean =
        current.isEmpty() && seeded.isNotEmpty()

    /** La première page serveur fait foi pour les réponses confirmées ; l'optimiste non couvert survit. */
    fun mergeFirstPage(current: List<ThreadReply>, fetched: List<ThreadReply>): List<ThreadReply> {
        val ids = fetched.map { it.id }.toSet()
        val cids = fetched.mapNotNull { it.clientMessageId }.toSet()
        val pending = current.filter { reply ->
            reply.status != ThreadReplyStatus.SENT &&
                reply.id !in ids && (reply.clientMessageId == null || reply.clientMessageId !in cids)
        }
        return ordered(fetched + pending)
    }

    fun appendPage(current: List<ThreadReply>, page: List<ThreadReply>): List<ThreadReply> {
        val known = current.map { it.id }.toSet()
        return ordered(current + page.filter { it.id !in known })
    }

    fun withOptimistic(current: List<ThreadReply>, reply: ThreadReply): List<ThreadReply> = current + reply

    fun without(current: List<ThreadReply>, id: String): List<ThreadReply> = current.filterNot { it.id == id }

    fun markFailed(current: List<ThreadReply>, id: String): List<ThreadReply> =
        current.map { if (it.id == id) it.copy(status = ThreadReplyStatus.FAILED) else it }

    fun canSend(text: String, sending: Boolean): Boolean = !sending && text.isNotBlank()

    private fun ordered(list: List<ThreadReply>): List<ThreadReply> = list.sortedBy { it.createdAtMillis }
}
