package me.meeshy.sdk.model.share

import me.meeshy.sdk.model.ApiMessage

/** Une carte : un contenu Meeshy (story, post, réel, profil, invitation) qui part comme un lien qu'on ouvre. */
data class ShareCard(
    val kind: ShareCardKind,
    val contentId: String,
    val title: String,
    val url: String?,
    /** Le texte qui part dans la conversation, déjà composé dans la langue de l'appareil (« Story de X : lien »). */
    val messageText: String?,
    val imageUrl: String? = null,
    val authorId: String? = null,
)

/**
 * **Ce que l'écran de partage unique reçoit** (#13469) — toutes les portes (appui long, sélection
 * multiple, story, post, réel, profil, lien profond, autre app) posent l'UNE de ces formes, et
 * l'écran fait le reste. Miroir de `ShareSubject` (iOS) ; le plan se lit depuis [entry].
 */
sealed interface ShareSubject {
    /** Un ou plusieurs messages, dans l'ordre du fil. */
    data class Messages(
        val messages: List<ApiMessage>,
        override val sourceConversationId: String?,
        val conversationIsEncrypted: Boolean = false,
    ) : ShareSubject

    /** UNE pièce d'un message — « Tout le message » élargit sans fermer. */
    data class Piece(
        val message: ApiMessage,
        val attachmentId: String,
        override val sourceConversationId: String?,
        val conversationIsEncrypted: Boolean = false,
    ) : ShareSubject

    data class Text(val text: String) : ShareSubject {
        override val sourceConversationId: String? get() = null
    }

    data class Link(val url: String) : ShareSubject {
        override val sourceConversationId: String? get() = null
    }

    data class Card(val card: ShareCard) : ShareSubject {
        override val sourceConversationId: String? get() = null
    }

    /**
     * Ce qu'une autre app remet à Meeshy (ACTION_SEND / SEND_MULTIPLE) : des fichiers déjà copiés dans
     * le cache privé ([media], dans l'ordre d'envoi) et le texte ou le lien joint ([text]). Miroir de
     * `ShareSubject.incoming` (iOS) ; le texte joint devient le corps du message, la légende s'y ajoute.
     */
    data class Incoming(val text: String?, val media: List<ShareMedia>) : ShareSubject {
        override val sourceConversationId: String? get() = null

        /** Un texte qui n'est qu'une adresse web part comme un lien. */
        val isLink: Boolean
            get() = media.isEmpty() && text != null && WEB_ADDRESS.matches(text.trim())
    }

    /** La conversation d'où le contenu vient : elle n'est jamais un destinataire. */
    val sourceConversationId: String?

    /** Les messages source, dans l'ordre — vides pour un contenu qui n'en vient pas. */
    val sourceMessages: List<ApiMessage>
        get() = when (this) {
            is Messages -> messages
            is Piece -> listOf(message)
            is Text, is Link, is Card, is Incoming -> emptyList()
        }

    /** L'entrée du plan. [removedMessageIds] : les messages ôtés de « Ce qui part ». */
    fun entry(removedMessageIds: Set<String> = emptySet()): ShareEntry = when (this) {
        is Messages -> ShareEntry.Messages(
            messages.filter { it.id !in removedMessageIds }.map { it.shareMessage(conversationIsEncrypted) },
        )
        is Piece -> ShareEntry.Piece(message.shareMessage(conversationIsEncrypted), attachmentId)
        is Text -> ShareEntry.Text(text)
        is Link -> ShareEntry.Link(url)
        is Card -> ShareEntry.Card(card.kind, card.url)
        is Incoming -> when {
            media.isNotEmpty() -> ShareEntry.Media(media, text?.takeIf { it.isNotBlank() })
            isLink -> ShareEntry.Link(text.orEmpty().trim())
            else -> ShareEntry.Text(text.orEmpty())
        }
    }

    /** « Tout le message » : la pièce s'élargit au message qui la porte. */
    val widenedToWholeMessage: ShareSubject?
        get() = (this as? Piece)?.let { Messages(listOf(it.message), it.sourceConversationId, it.conversationIsEncrypted) }

    /**
     * Le texte qui part pour une entrée qui n'est pas un message : le texte, le lien ou la carte.
     * La légende s'y joint ; elle reste à part pour un transfert (D4).
     */
    fun composedText(caption: String): String? {
        val trimmed = caption.trim()
        val body = when (this) {
            is Text -> text
            is Link -> url
            is Card -> card.messageText
            is Incoming -> text?.trim()
            is Messages, is Piece -> return null
        }
        if (body.isNullOrEmpty()) return trimmed.ifEmpty { null }
        return if (trimmed.isEmpty()) body else "$trimmed\n$body"
    }
}

private val WEB_ADDRESS = Regex("https?://\\S+")
