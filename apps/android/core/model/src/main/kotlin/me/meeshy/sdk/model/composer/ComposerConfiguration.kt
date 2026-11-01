package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.ComposerMode

/** Une porte du composeur universel : une bascule, une tuile du « + », ou ce que la rangée de saisie offre. */
public enum class ComposerCapability {
    EPHEMERAL,
    BLUR,
    VIEW_ONCE,
    EFFECTS,
    LANGUAGE,
    QUICK_EMOJIS,
    EMOJI,
    VOICE,
    PHOTO_LIBRARY,
    CAMERA,
    FILE,
    CONTACT,
    LOCATION,
    STICKER,
    ;

    public companion object {
        /** Les portes qui joignent une pièce : un hôte qui ne sait pas en recevoir les ferme toutes. */
        public val ATTACHMENTS: Set<ComposerCapability> = setOf(VOICE, PHOTO_LIBRARY, CAMERA, FILE, CONTACT, LOCATION, STICKER)
    }
}

/**
 * **LE RÉGLAGE DU COMPOSEUR UNIVERSEL** (#14265) — miroir d'iOS `UniversalComposerBar(mode:)`. UN composeur, celui des
 * conversations, sert aussi les commentaires ; ce qui change d'une surface à l'autre est CE réglage, jamais un second
 * composeur. Une porte absente de [capabilities] ne s'affiche pas.
 */
public data class ComposerConfiguration(
    val capabilities: Set<ComposerCapability>,
    val maxLength: Int? = null,
) {
    public fun offers(capability: ComposerCapability): Boolean = capability in capabilities

    public fun bounded(text: String): String = maxLength?.let(text::take) ?: text

    public fun without(capability: ComposerCapability): ComposerConfiguration = copy(capabilities = capabilities - capability)

    public fun withoutAttachments(): ComposerConfiguration = copy(capabilities = capabilities - ComposerCapability.ATTACHMENTS)

    public companion object {
        /** La conversation : toutes les portes, bornées ensuite par les droits de la conversation. */
        public val CONVERSATION: ComposerConfiguration = ComposerConfiguration(ComposerCapability.entries.toSet())

        /**
         * Le commentaire (iOS `ComposerMode.comment` + `voiceDoor: .open` + `forceShowAttachment`) : texte borné à 2 000,
         * emoji, vocal, photothèque, caméra. iOS n'y a ni éphémère, ni vue unique, ni feuille d'effets, ni sticker, ni
         * carte de contact, ni emojis rapides. Le fichier, le lieu, la langue, le flou et les effets permanents d'iOS
         * attendent que le fil Android sache les envoyer et les afficher (#14265).
         */
        public val COMMENT: ComposerConfiguration = ComposerConfiguration(
            capabilities = setOf(
                ComposerCapability.EMOJI,
                ComposerCapability.VOICE,
                ComposerCapability.PHOTO_LIBRARY,
                ComposerCapability.CAMERA,
            ),
            maxLength = ComposerMode.COMMENT.maxLength,
        )
    }
}
