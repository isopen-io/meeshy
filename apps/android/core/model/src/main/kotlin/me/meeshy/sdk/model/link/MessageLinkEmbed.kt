package me.meeshy.sdk.model.link

import me.meeshy.sdk.model.YouTubeLinkDetector
import me.meeshy.sdk.model.deeplink.ContentLinkTarget
import me.meeshy.sdk.model.deeplink.ConversationCardTarget
import me.meeshy.sdk.model.deeplink.ConversationLinkTarget

/**
 * Ce que les liens d'un message ont le droit de faire SORTIR de l'appareil — miroir de `BubbleContent.LinkExposure`
 * (iOS, #12768, #10286). La loi se lit sur le MESSAGE, jamais sur un réglage que l'hôte poserait.
 */
enum class MessageLinkExposure {
    /** Aperçu, carte de conversation, carte de contenu. */
    OPEN,

    /** Le texte n'est lu que par cet appareil : rien ne part chercher ses adresses, ni chez un site, ni chez le serveur. */
    SEALED,

    /** L'auteur n'a pas de compte : aucune adresse n'attache quoi que ce soit. */
    INERT,
    ;

    companion object {
        fun of(senderHasAccount: Boolean, readOnlyOnDevice: Boolean): MessageLinkExposure = when {
            !senderHasAccount -> INERT
            readOnlyOnDevice -> SEALED
            else -> OPEN
        }
    }
}

/**
 * Ce qu'un message attache SOUS son texte (iOS `BubbleLinkEmbed`, contrat #19331 § 5.1), résolu une fois par texte.
 * Précédence : la vidéo puis la carte de conversation du PREMIER lien (l'existant), puis la carte du PREMIER lien de
 * contenu du message, puis l'aperçu générique du premier lien.
 */
sealed interface MessageLinkEmbed {
    /** L'adresse dont l'aperçu générique prend la place quand rien de plus riche ne se montre ; `null` : rien. */
    val previewUrl: String?

    data object None : MessageLinkEmbed {
        override val previewUrl: String? = null
    }

    data class ConversationCard(val url: String, val target: ConversationCardTarget) : MessageLinkEmbed {
        override val previewUrl: String = url
    }

    data class ContentCard(val url: String, val target: ContentLinkTarget) : MessageLinkEmbed {
        override val previewUrl: String = url
    }

    data class Preview(val url: String) : MessageLinkEmbed {
        override val previewUrl: String = url
    }

    companion object {
        /**
         * [urls] : les adresses du texte, dans l'ordre. [conversationWebOrigin] `null` : aucun hôte ne monte les cartes
         * de conversation ; [showsContentCards] faux : aucun hôte ne monte les cartes de contenu.
         */
        fun choose(
            urls: List<String>,
            exposure: MessageLinkExposure,
            conversationWebOrigin: String?,
            showsContentCards: Boolean,
        ): MessageLinkEmbed {
            if (exposure != MessageLinkExposure.OPEN) return None
            val first = urls.firstOrNull() ?: return None
            if (YouTubeLinkDetector.detect(first) != null) return Preview(first)
            conversationWebOrigin?.let { origin -> ConversationLinkTarget.target(first, origin) }
                ?.let { return ConversationCard(first, it) }
            if (showsContentCards) {
                urls.firstNotNullOfOrNull { url -> ContentLinkTarget.of(url)?.let { ContentCard(url, it) } }?.let { return it }
            }
            return Preview(first)
        }
    }
}
