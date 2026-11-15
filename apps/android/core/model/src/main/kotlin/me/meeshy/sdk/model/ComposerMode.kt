package me.meeshy.sdk.model

/**
 * Les modes d'écriture partagés (message, post, statut, story, commentaire, légende) avec
 * leurs limites et capacités. Miroir d'iOS `ComposerMode`. Le placeholder n'est pas un
 * littéral : la couche UI le résout depuis une ressource, par mode.
 */
public enum class ComposerMode(
    public val maxLength: Int?,
    public val showVoice: Boolean = false,
    public val showAttachment: Boolean = false,
    public val showLanguageSelector: Boolean = false,
    public val showEphemeral: Boolean = false,
    public val showViewOnce: Boolean = false,
    public val showEffectsSheet: Boolean = false,
    public val showPermanentEffects: Boolean = false,
) {
    MESSAGE(
        maxLength = null, showVoice = true, showAttachment = true, showLanguageSelector = true,
        showEphemeral = true, showViewOnce = true, showEffectsSheet = true,
    ),
    POST(maxLength = 5_000, showAttachment = true),
    STATUS(maxLength = 500),
    STORY(maxLength = 1_000, showVoice = true),
    COMMENT(maxLength = 2_000, showLanguageSelector = true, showPermanentEffects = true),
    CAPTION(maxLength = 500),
}
