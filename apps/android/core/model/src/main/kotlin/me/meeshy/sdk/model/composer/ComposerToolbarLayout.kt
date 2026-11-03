package me.meeshy.sdk.model.composer

/** Les portes qui défilent dans le bandeau, après les bascules de protection et d'effets. */
public enum class ComposerToolbarSlot { STICKER }

/** Le plan du bandeau : le défilant, la langue épinglée en dernier, puis la bande de fin fixe. */
public data class ComposerToolbarPlan(
    val scrolling: List<ComposerToolbarSlot>,
    val pinnedLanguage: Boolean,
    val trailing: List<ComposerTrailingDoor>,
) {
    public companion object {
        public val EMPTY: ComposerToolbarPlan = ComposerToolbarPlan(emptyList(), false, emptyList())
    }
}

/** L'ordre des portes du bandeau (iOS `topToolbar`), sans Compose. */
public object ComposerToolbarLayout {
    public fun plan(
        isRecording: Boolean,
        offersSticker: Boolean,
        offersLanguage: Boolean,
        offersLibrary: Boolean,
        offersCamera: Boolean,
        offersFold: Boolean,
        foldSurvivesRecording: Boolean,
    ): ComposerToolbarPlan {
        if (isRecording) {
            return if (foldSurvivesRecording && offersFold) {
                ComposerToolbarPlan(emptyList(), false, listOf(ComposerTrailingDoor.FOLD))
            } else {
                ComposerToolbarPlan.EMPTY
            }
        }
        return ComposerToolbarPlan(
            scrolling = if (offersSticker) listOf(ComposerToolbarSlot.STICKER) else emptyList(),
            pinnedLanguage = offersLanguage,
            trailing = ComposerToolbarDoors.trailing(offersLibrary, offersCamera, offersFold),
        )
    }
}
