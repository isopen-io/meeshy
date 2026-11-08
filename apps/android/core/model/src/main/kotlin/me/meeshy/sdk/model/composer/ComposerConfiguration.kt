package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.ComposerMode
import me.meeshy.sdk.model.MessageEffectSection

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
    /** Le ⌄ qui replie la barre, à l'angle droit de la rangée d'outils (iOS `foldButton`, #8642). */
    FOLD,
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
    /** Le ⌄ s'efface pendant qu'on écrit ou qu'on enregistre (conversation, #9955) ; celui d'un commentaire reste (#9122). */
    val foldYieldsToComposing: Boolean = true,
    /** Les sections que la porte des effets montre : un commentaire n'a que les effets PERMANENTS (iOS `showPermanentEffects`). */
    val effectSections: Set<MessageEffectSection> = MessageEffectSection.entries.toSet(),
) {
    public fun offers(capability: ComposerCapability): Boolean = capability in capabilities

    /** Le ⌄ n'existe que barre dépliée, et hors composition quand le réglage le veut (iOS `CommentComposerFoldModifier`). */
    public fun offersFold(folded: Boolean, isComposing: Boolean): Boolean =
        offers(ComposerCapability.FOLD) && !folded && !(foldYieldsToComposing && isComposing)

    /** Le réglage qu'une surface sert : une porte qu'elle ne sait pas exécuter ne s'affiche pas (loi 4). */
    public fun servedBy(
        receivesAttachments: Boolean,
        picksLanguage: Boolean,
        sendsQuickEmoji: Boolean,
        appliesEffects: Boolean = true,
        picksPlace: Boolean = true,
    ): ComposerConfiguration =
        copy(
            capabilities = capabilities -
                (if (receivesAttachments) emptySet() else ComposerCapability.ATTACHMENTS) -
                (if (picksLanguage) emptySet() else setOf(ComposerCapability.LANGUAGE)) -
                (if (sendsQuickEmoji) emptySet() else setOf(ComposerCapability.QUICK_EMOJIS)) -
                (if (appliesEffects) emptySet() else setOf(ComposerCapability.BLUR, ComposerCapability.EFFECTS)) -
                (if (picksPlace) emptySet() else setOf(ComposerCapability.LOCATION)),
        )

    public fun bounded(text: String): String = maxLength?.let(text::take) ?: text

    public fun without(capability: ComposerCapability): ComposerConfiguration = copy(capabilities = capabilities - capability)

    public fun withoutAttachments(): ComposerConfiguration = copy(capabilities = capabilities - ComposerCapability.ATTACHMENTS)

    public companion object {
        /** La conversation : toutes les portes, bornées ensuite par les droits de la conversation. */
        public val CONVERSATION: ComposerConfiguration = ComposerConfiguration(ComposerCapability.entries.toSet())

        /**
         * Le commentaire (iOS `ComposerMode.comment` + `voiceDoor: .open` + `forceShowAttachment` + `foldableComment`) :
         * la géométrie de la barre de message (#14384) — pastille de langue, sticker, photothèque, caméra et ⌄ à droite,
         * emojis rapides dans la zone d'envoi — texte borné à 2 000, emoji et vocal. Le flou et les effets PERMANENTS
         * (#14385, iOS `commentBlurEnabled` + `showPermanentEffects`). Ni éphémère, ni vue unique, ni effet d'apparition, ni
         * carte de contact (iOS les ferme aussi). Le fichier (#14386, iOS `onFilePicker`) et le lieu (#14387, iOS
         * `onLocationRequest`). Le ⌄ reste visible clavier levé, comme dans tout espace commentaire d'iOS.
         */
        public val COMMENT: ComposerConfiguration = ComposerConfiguration(
            capabilities = setOf(
                ComposerCapability.BLUR,
                ComposerCapability.EFFECTS,
                ComposerCapability.LANGUAGE,
                ComposerCapability.QUICK_EMOJIS,
                ComposerCapability.EMOJI,
                ComposerCapability.VOICE,
                ComposerCapability.PHOTO_LIBRARY,
                ComposerCapability.CAMERA,
                ComposerCapability.FILE,
                ComposerCapability.LOCATION,
                ComposerCapability.STICKER,
                ComposerCapability.FOLD,
            ),
            maxLength = ComposerMode.COMMENT.maxLength,
            foldYieldsToComposing = false,
            effectSections = setOf(MessageEffectSection.PERMANENT),
        )
    }
}
