package me.meeshy.sdk.model.share

import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ContentExitLaw
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.contentExitSubject

/** Un message à poster dans UNE conversation de destination. */
data class OutgoingShare(
    val content: String,
    val originalLanguage: String?,
    /** L'origine d'un transfert (`forwardedFromId`) ; nul pour un texte, un lien ou une légende. */
    val forwardedFromId: String?,
    val forwardedFromConversationId: String?,
    val effectFlags: Long,
    val ephemeralDuration: Int?,
)

/** Ce que le partage va poster, ou pourquoi il ne poste rien. */
sealed interface ShareOutgoingResult {
    data class Ready(val messages: List<OutgoingShare>) : ShareOutgoingResult

    data class Refused(val failure: ShareFailure) : ShareOutgoingResult
}

/**
 * **Ce qui part vers un destinataire** (#13469) — pur, rejoué à l'identique pour chacun.
 *
 * - Un message est RE-posté avec ses références `forwardedFrom` ; la copie emporte la protection
 *   de sa source (loi de sortie : la durée d'une flamme est bornée par celle de la source, le
 *   flou passe à la copie). Un message que la loi refuse ne part pas ; si rien ne reste, rien ne part.
 * - Une source chiffrée de bout en bout ne part JAMAIS : Android ne déchiffre pas encore (#13015),
 *   donc n'a aucun clair à copier — fail-closed, jamais le chiffré posé comme texte.
 * - La légende d'un transfert part en message à part, juste après la copie (D4), avec la
 *   protection de ce qu'elle légende.
 * - Un texte, un lien ou une carte part comme UN message de texte (légende jointe).
 */
object ShareOutgoingBuilder {

    fun build(
        subject: ShareSubject,
        removedMessageIds: Set<String>,
        caption: String,
        chosenDurationSeconds: Int?,
    ): ShareOutgoingResult = when (subject) {
        is ShareSubject.Messages -> forwards(
            sources = subject.messages.filter { it.id !in removedMessageIds },
            sourceConversationId = subject.sourceConversationId,
            conversationIsEncrypted = subject.conversationIsEncrypted,
            caption = caption,
            chosenDurationSeconds = chosenDurationSeconds,
        )
        is ShareSubject.Piece -> ShareOutgoingResult.Refused(ShareFailure.GENERIC)
        is ShareSubject.Incoming -> {
            val text = subject.composedText(caption)
            when {
                !text.isNullOrBlank() -> ShareOutgoingResult.Ready(listOf(plainText(text, ContentExitLaw.CopyProtection(0L, false, null))))
                subject.media.isNotEmpty() -> ShareOutgoingResult.Ready(emptyList())
                else -> ShareOutgoingResult.Refused(ShareFailure.NOTHING_TO_SEND)
            }
        }
        is ShareSubject.Text, is ShareSubject.Link, is ShareSubject.Card -> {
            val text = subject.composedText(caption)
            if (text.isNullOrBlank()) {
                ShareOutgoingResult.Refused(ShareFailure.NOTHING_TO_SEND)
            } else {
                ShareOutgoingResult.Ready(listOf(plainText(text, ContentExitLaw.CopyProtection(0L, false, null))))
            }
        }
    }

    private fun plainText(text: String, protection: ContentExitLaw.CopyProtection) = OutgoingShare(
        content = text, originalLanguage = null, forwardedFromId = null, forwardedFromConversationId = null,
        effectFlags = protection.effectFlags, ephemeralDuration = protection.ephemeralDuration,
    )

    private fun forwards(
        sources: List<ApiMessage>,
        sourceConversationId: String?,
        conversationIsEncrypted: Boolean,
        caption: String,
        chosenDurationSeconds: Int?,
    ): ShareOutgoingResult {
        if (conversationIsEncrypted || sources.any { it.shareMessage().encrypted }) {
            return ShareOutgoingResult.Refused(ShareFailure.SEALED_SOURCE)
        }
        val request = ContentExitLaw.CopyRequest(ephemeralDuration = chosenDurationSeconds?.toDouble())
        val copies = sources.mapNotNull { source ->
            ContentExitLaw.forwardedCopyProtection(source.contentExitSubject, request)?.let { source to it }
        }
        if (copies.isEmpty()) return ShareOutgoingResult.Refused(ShareFailure.NOTHING_TO_SEND)
        val posts = copies.map { (source, protection) ->
            OutgoingShare(
                content = source.content, originalLanguage = source.originalLanguage, forwardedFromId = source.id,
                forwardedFromConversationId = sourceConversationId, effectFlags = protection.effectFlags,
                ephemeralDuration = protection.ephemeralDuration,
            )
        }
        val trimmed = caption.trim()
        if (trimmed.isEmpty()) return ShareOutgoingResult.Ready(posts)
        return ShareOutgoingResult.Ready(posts + plainText(trimmed, captionProtection(copies.map { it.second })))
    }

    /** La légende ne survit pas à une flamme (durée la plus courte) et se floute avec un flouté. */
    private fun captionProtection(copies: List<ContentExitLaw.CopyProtection>): ContentExitLaw.CopyProtection {
        val shortest = copies.mapNotNull { it.ephemeralDuration }.minOrNull()
        val blurred = copies.any { it.isBlurred }
        val flags = copies.fold(0L) { acc, c -> acc or c.effectFlags } and
            (MessageEffectFlags.BLURRED or MessageEffectFlags.EPHEMERAL or MessageEffectFlags.EPHEMERAL_AFTER_READ)
        return ContentExitLaw.CopyProtection(
            effectFlags = if (shortest == null) flags and MessageEffectFlags.BLURRED else flags,
            isBlurred = blurred,
            ephemeralDuration = shortest,
        )
    }
}
