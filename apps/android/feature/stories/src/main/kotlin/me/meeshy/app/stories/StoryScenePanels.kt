package me.meeshy.app.stories

/** Les panneaux que le « ⋯ » ouvre sans outil de la bande : la durée de la diapo et la légende (#13834) ; le socle, le texte du post (#13863). */
internal enum class StoryMorePanel { DURATION, CAPTION, POST_TEXT }

/** Ce qui monte au bas de la scène : un seul panneau, celui du geste en cours (#13834). */
internal enum class StoryScenePanel { DRAWING, TEXT, TOOL, DURATION, CAPTION, SCENE_EFFECTS }

/**
 * Le panneau du geste en cours, par ordre de préséance : le pinceau, le texte qu'on écrit, l'outil ouvert, ce que le « ⋯ »
 * a ouvert, puis le carrousel d'effets du fond (le Cadrage vit dans Fond › Modifier, #13973). Au repos : aucun. Un objet SÉLECTIONNÉ n'en monte aucun : ses
 * actions sont sur sa barre, et son Modifier ou son Temps font monter une feuille (#13836).
 */
internal fun StoryComposerUiState.scenePanel(local: StoryMorePanel?): StoryScenePanel? = when {
    isDrawingActive -> StoryScenePanel.DRAWING
    isEditingTextElement -> StoryScenePanel.TEXT
    band.activeTool != null -> StoryScenePanel.TOOL
    local == StoryMorePanel.DURATION -> StoryScenePanel.DURATION
    local == StoryMorePanel.CAPTION || local == StoryMorePanel.POST_TEXT -> StoryScenePanel.CAPTION
    sceneEffectCarousel != null -> StoryScenePanel.SCENE_EFFECTS
    else -> null
}
