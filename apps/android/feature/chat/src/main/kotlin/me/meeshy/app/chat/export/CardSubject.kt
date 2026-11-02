package me.meeshy.app.chat.export

import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import me.meeshy.sdk.model.MessageExit
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.ui.component.bubble.BubbleContent

data class CardPart(val author: String, val text: String, val handle: String? = null)

data class CardSubject(
    val quoted: CardPart?,
    val reply: CardPart,
    /** L'heure d'envoi de la réponse — la date qu'une carte peut afficher. */
    val sentAtMillis: Long,
    val quotedAtMillis: Long? = null,
    /** Les médias que la carte peint sous la réponse (#14330). */
    val media: List<CardMedia> = emptyList(),
) {
    /** Les pseudos sont-ils connus ? « pseudo au lieu du nom » n'existe qu'alors. */
    val hasHandles: Boolean get() = reply.handle != null || quoted?.handle != null
}

data class CardViewer(val id: String?, val displayName: String?, val username: String?)

/** Pourquoi un message ne s'image pas. */
enum class CardRefusal { DELETED, NOTICE, PROTECTED, SEALED, QUOTES_PROTECTED, EMPTY }

data class CardLanguage(val code: String, val text: String)

/**
 * CE QU'UNE CARTE A LE DROIT DE MONTRER — miroir (texte, photos, vidéos) de `MessageCardSubject.swift`.
 *
 * GARDE : un message protégé (vue unique, flouté, éphémère, supprimé, avis système, chiffré
 * illisible ici) ne s'exporte pas. Une image est une copie qu'on partage : ce qui ne se copie pas
 * ne se peint pas. La CITATION est celle que la bulle montre déjà. Tout se fait en local à partir
 * du clair déjà déchiffré ; rien n'est envoyé au serveur.
 */
object CardSubjects {

    fun refusal(bubble: BubbleContent, nowMillis: Long): CardRefusal? {
        if (bubble.isDeleted) return CardRefusal.DELETED
        if (bubble.isSystem) return CardRefusal.NOTICE
        if (bubble.isEndToEndSealed) return CardRefusal.SEALED
        if (bubble.isViewOnce || bubble.isViewOnceOpenedByMe || bubble.isBlurred || bubble.blurReveal != null) return CardRefusal.PROTECTED
        if (!bubble.expiresAtIso.isNullOrBlank()) return CardRefusal.PROTECTED
        val offer = bubble.exitOffer
        if (offer.quotesProtectedContent) return CardRefusal.QUOTES_PROTECTED
        if (!offer.offers(MessageExit.IMAGINE) || CardMediaPicking.isProtected(bubble)) return CardRefusal.PROTECTED
        if (CardText.nonBlank(bubble.text) == null && CardMediaPicking.paintable(bubble).isEmpty()) return CardRefusal.EMPTY
        return null
    }

    /** Les langues où la réponse EXISTE : son original d'abord, puis la traduction servie. Vide : une seule. */
    fun languages(bubble: BubbleContent): List<CardLanguage> {
        if (!bubble.isTranslated) return emptyList()
        val original = bubble.languageStrip.firstOrNull { it.isOriginal }?.code?.lowercase()
        val served = bubble.languageStrip.firstOrNull { it.isActive && !it.isOriginal }?.code?.lowercase()
        val originalText = CardText.nonBlank(bubble.originalText)
        return buildList {
            if (original != null && originalText != null) add(CardLanguage(original, originalText))
            if (served != null && !bubble.isShowingOriginal && CardText.nonBlank(bubble.text) != null) add(CardLanguage(served, bubble.text))
        }.distinctBy { it.code }
    }

    fun of(bubble: BubbleContent, viewer: CardViewer, nowMillis: Long, language: String? = null): CardSubject? {
        if (refusal(bubble, nowMillis) != null) return null
        val chosen = language
            ?.let { code -> languages(bubble).firstOrNull { it.code == code.lowercase() }?.text }
            ?: bubble.text
        val isViewer = bubble.isOutgoing
        val reply = CardPart(
            author = author(isViewer, listOf(bubble.senderName, bubble.senderUsername), viewer),
            text = chosen.trim(),
            handle = if (isViewer) viewer.username ?: bubble.senderUsername else bubble.senderUsername,
        )
        return CardSubject(
            quoted = quote(bubble, viewer),
            reply = reply,
            sentAtMillis = bubble.createdAtIso?.let { isoToEpochMillisOrNull(it) } ?: nowMillis,
            media = CardMediaPicking.paintable(bubble),
        )
    }

    private fun quote(bubble: BubbleContent, viewer: CardViewer): CardPart? {
        if (bubble.replyToDeleted || bubble.storyReply != null) return null
        val text = CardText.nonBlank(bubble.replyToText) ?: return null
        return CardPart(
            author = author(bubble.replyToIsMe, listOf(bubble.replyToSenderName), viewer),
            text = text,
            handle = if (bubble.replyToIsMe) viewer.username else null,
        )
    }

    private fun author(isViewer: Boolean, names: List<String?>, viewer: CardViewer): String {
        val candidates = if (isViewer) listOf(viewer.displayName) + names else names
        return candidates.firstNotNullOfOrNull { CardText.nonBlank(it) } ?: "Meeshy"
    }

    /** Le nom du fichier : lisible dans une galerie, sans rien du contenu. */
    fun fileName(epochMillis: Long, zoneOffsetSeconds: Int): String {
        val stamp = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")
            .format(Instant.ofEpochMilli(epochMillis).atOffset(ZoneOffset.ofTotalSeconds(zoneOffsetSeconds)))
        return "meeshy-$stamp.png"
    }
}
