package me.meeshy.app.stories

/** Les panneaux que le « ⋯ » ouvre sans outil de la bande : la durée de la diapo et la légende (#13834). */
internal enum class StoryMorePanel { DURATION, CAPTION }

/** Ce qui monte au bas de la scène : un seul panneau, celui du geste en cours (#13834). */
internal enum class StoryScenePanel { DRAWING, TEXT, STICKER, MEDIA, SOUND, TOOL, DURATION, CAPTION, SCENE_EFFECTS }

/**
 * Le panneau du geste en cours, par ordre de préséance : le pinceau, l'objet touché (texte, sticker, média, son), l'outil
 * ouvert, ce que le « ⋯ » a ouvert, puis le cadre ou le carrousel d'effets du fond. Au repos : aucun.
 */
internal fun StoryComposerUiState.scenePanel(local: StoryMorePanel?): StoryScenePanel? = when {
    isDrawingActive -> StoryScenePanel.DRAWING
    isEditingTextElement -> StoryScenePanel.TEXT
    selectedSticker != null && !isTimelineOpen -> StoryScenePanel.STICKER
    selectedMedia != null && band.activeTool == null -> StoryScenePanel.MEDIA
    selectedSound != null && band.activeTool == null -> StoryScenePanel.SOUND
    band.activeTool != null -> StoryScenePanel.TOOL
    local == StoryMorePanel.DURATION -> StoryScenePanel.DURATION
    local == StoryMorePanel.CAPTION -> StoryScenePanel.CAPTION
    frameOpen || sceneEffectCarousel != null -> StoryScenePanel.SCENE_EFFECTS
    else -> null
}
