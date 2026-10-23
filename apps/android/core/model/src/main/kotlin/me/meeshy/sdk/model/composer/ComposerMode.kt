package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.ComposerMode

/** Le libellé d'invite du champ, résolu en ressource par la couche UI (jamais un littéral ici). */
enum class ComposerPlaceholder { MESSAGE, POST, STATUS, REPLY, COMMENT, CAPTION, PREVIEW }

/**
 * Les préréglages du composeur réutilisable : où il est posé, ce qu'il montre et jusqu'où il
 * accepte du texte. Chaque préréglage s'appuie sur un [ComposerMode] (sa longueur max et ses
 * portes) et y ajoute ce que le mode seul ne dit pas : l'invite, et les portes qui dépendent
 * du lieu (réponse à un média, canevas de story, aperçu de notification).
 */
enum class ComposerPreset(
    val mode: ComposerMode,
    val placeholder: ComposerPlaceholder,
    val showVoice: Boolean,
    val showAttachment: Boolean,
    val showLanguageSelector: Boolean,
    val showEphemeral: Boolean,
    val showViewOnce: Boolean,
    val showEffectsSheet: Boolean,
    val showPermanentEffects: Boolean,
    val isReadOnly: Boolean = false,
) {
    CONVERSATION(ComposerMode.MESSAGE, ComposerPlaceholder.MESSAGE, true, true, true, true, true, true, false),
    COMMENT(ComposerMode.COMMENT, ComposerPlaceholder.COMMENT, false, false, true, false, false, false, true),
    MEDIA_REPLY(ComposerMode.STORY, ComposerPlaceholder.REPLY, true, false, false, false, false, false, false),
    STORY_CANVAS(ComposerMode.CAPTION, ComposerPlaceholder.CAPTION, false, false, false, false, false, false, false),
    NOTIFICATION_PREVIEW(
        ComposerMode.MESSAGE, ComposerPlaceholder.PREVIEW, false, false, false, false, false, false, false,
        isReadOnly = true,
    ),
    ;

    val maxLength: Int? get() = mode.maxLength

    /** Vrai quand [length] dépasse la longueur max du préréglage (jamais pour une longueur libre). */
    fun exceeds(length: Int): Boolean = maxLength?.let { length > it } ?: false

    /** Le texte tronqué à la longueur max : une saisie ne la dépasse jamais. */
    fun clamp(text: String): String = maxLength?.let { text.take(it) } ?: text
}
