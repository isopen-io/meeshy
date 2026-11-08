package me.meeshy.app.stories

/**
 * Surfaces que le lecteur ouvre PAR-DESSUS la story — iOS `StoryReaderSurfaceRules`. Elles ont
 * toutes le même contrat : le premier toucher les referme, sans naviguer.
 */
internal object StoryReaderSurfaceRules {
    fun hasActiveReaderFeature(
        showLanguageOptions: Boolean = false,
        showFullLanguagePicker: Boolean = false,
        showEmojiStrip: Boolean = false,
        showFullEmojiPicker: Boolean = false,
        showCommentsOverlay: Boolean = false,
        showAudioTranscript: Boolean = false,
    ): Boolean = showLanguageOptions || showFullLanguagePicker || showEmojiStrip ||
        showFullEmojiPicker || showCommentsOverlay || showAudioTranscript
}
