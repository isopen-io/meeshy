package me.meeshy.sdk.model

import me.meeshy.sdk.lang.PrismCandidate
import me.meeshy.sdk.lang.PrismTranslationResolver

/**
 * La citation figée d'un message — ce que sa bulle montre au-dessus de son texte. Miroir de `EngravedReply`
 * (iOS), réduit aux faits que l'ingestion grave.
 */
data class EngravedReply(
    val kind: Kind,
    /** L'identifiant cité : message, story ou humeur. */
    val targetId: String,
    val previewText: String,
    val authorName: String = "",
    val authorUserId: String? = null,
    val authorAvatarUrl: String? = null,
    val moodEmoji: String? = null,
    val publishedAtIso: String? = null,
    val reactionCount: Int = 0,
    val commentCount: Int = 0,
    val shareCount: Int = 0,
    val thumbnailUrl: String? = null,
    /** Le post cité est retiré : « Story indisponible » / « Publication indisponible ». */
    val isUnavailable: Boolean = false,
    /** La langue du [previewText] servi par le Prisme du lecteur ; `null` ⇒ l'original. */
    val servedLanguage: String? = null,
) {
    enum class Kind { MESSAGE, STORY, MOOD }
}

/**
 * **L'unique constructeur de la citation gravée à l'ingestion** (miroir de `replyToJson` / `ingestedReply`, iOS).
 *
 * - Un instantané de POST (`postReplyTo`) survit à l'expiration de sa source : humeur = emoji + contenu + date,
 *   story = aperçu + compteurs ; un post retiré se dit indisponible.
 * - Un `storyReplyToId` SEUL (l'instantané n'a pas voyagé) grave le repli « story indisponible », qui ne comble
 *   qu'une case VIDE : un écho allégé ne dégrade jamais une citation riche.
 * - Une citation de MESSAGE sert le texte du premier rang du prisme ORDONNÉ du lecteur (rangs 1 à 4, la langue
 *   d'origine à son rang, jamais `translations.first()`), sauf si le cité est protégé : son texte ne se republie pas.
 *
 * Le prisme est résolu à l'ENFILAGE par l'appelant, jamais dans la boucle d'écriture.
 */
object ReplyReferenceBuilder {

    fun build(message: ApiMessage, readerPrism: List<String>): EngravedReply? {
        message.postReplyTo?.let { return post(it) }
        message.replyTo?.let { return quote(it, readerPrism) }
        return message.storyReplyToId?.takeIf { it.isNotBlank() }?.let { unavailable(it) }
    }

    /**
     * [message] dont l'instantané de post est normalisé (aperçu rogné, humeur vide ignorée) et dont le repli
     * est gravé ; le même objet quand rien ne change, pour que l'ingestion n'écrive pas pour rien.
     */
    fun engrave(message: ApiMessage): ApiMessage {
        val snapshot = message.postReplyTo
        if (snapshot != null) {
            val trimmed = snapshot.previewText.trim()
            val mood = snapshot.moodEmoji?.trim()?.ifBlank { null }
            if (trimmed == snapshot.previewText && mood == snapshot.moodEmoji) return message
            return message.copy(postReplyTo = snapshot.copy(previewText = trimmed, moodEmoji = mood))
        }
        val storyId = message.storyReplyToId?.takeIf { it.isNotBlank() } ?: return message
        return message.copy(postReplyTo = ApiPostReplyTarget(id = storyId, unavailable = true))
    }

    private fun post(target: ApiPostReplyTarget): EngravedReply {
        if (target.unavailable) return unavailable(target.id)
        val preview = target.previewText.trim()
        val mood = target.moodEmoji?.trim()?.ifBlank { null }
        if (mood != null) {
            return EngravedReply(
                kind = EngravedReply.Kind.MOOD,
                targetId = target.id,
                previewText = preview,
                moodEmoji = mood,
                publishedAtIso = target.createdAt,
            )
        }
        return EngravedReply(
            kind = EngravedReply.Kind.STORY,
            targetId = target.id,
            previewText = preview,
            publishedAtIso = target.createdAt,
            reactionCount = target.reactionCount,
            commentCount = target.commentCount,
            shareCount = target.shareCount,
            thumbnailUrl = target.thumbnailUrl?.takeIf { it.isNotBlank() },
        )
    }

    private fun quote(quote: ApiMessageReplyPreview, readerPrism: List<String>): EngravedReply {
        val served = if (quote.isProtected) null else PrismTranslationResolver.resolve(
            originalLanguage = quote.originalLanguage,
            candidates = quote.translations.orEmpty()
                .filter { it.isEncrypted != true }
                .map { PrismCandidate(it.targetLanguage, it.translatedContent) },
            preferredLanguages = readerPrism,
        )
        val text = when {
            quote.isProtected -> ""
            quote.content.isBlank() -> ""
            else -> served?.text ?: quote.content
        }
        return EngravedReply(
            kind = EngravedReply.Kind.MESSAGE,
            targetId = quote.id,
            previewText = text,
            authorName = quote.sender?.name?.takeIf { it.isNotBlank() } ?: quote.senderDisplayName.orEmpty(),
            authorUserId = quote.authorUserId,
            authorAvatarUrl = quote.authorAvatarUrl,
            publishedAtIso = null,
            servedLanguage = served?.language.takeIf { text.isNotEmpty() },
        )
    }

    private fun unavailable(postId: String) =
        EngravedReply(kind = EngravedReply.Kind.STORY, targetId = postId, previewText = "", isUnavailable = true)
}
