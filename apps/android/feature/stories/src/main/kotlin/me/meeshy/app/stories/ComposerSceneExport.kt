package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.composer.scene.ComposerOverflowEntries
import me.meeshy.sdk.model.composer.scene.ComposerOverflowEntry
import me.meeshy.sdk.model.composer.scene.SceneExportDestination
import me.meeshy.sdk.model.scene.export.StoryExportMode

/**
 * **LE COMPOSITEUR EXPORTE TOUTES SES SLIDES** (#13897) : chaque slide publiable, bout à bout, telle que l'aperçu la joue et
 * que la publication l'enverrait ([StoryComposerPreview]) — par le moteur des stories, qui rend la durée entière, les sons à
 * leur place, la vidéo de fond à sa boucle et une scène fixe en image. La slide affichée n'a pas de privilège : l'export est
 * offert dès qu'une slide quelconque publierait quelque chose.
 */
internal object ComposerSceneExport {

    fun entries(state: StoryComposerUiState): List<ComposerOverflowEntry> =
        ComposerOverflowEntries.served(hasScene = state.deck.publishableSlides.isNotEmpty())

    /** [project] : la projection que le lecteur peint, celle de l'aperçu plein écran. */
    fun scenes(state: StoryComposerUiState, language: String, project: (StoryItem) -> StorySlideView): List<Pair<StoryItem, StorySlideView>> =
        StoryComposerPreview.items(state, language).map { it to project(it) }

    fun mode(destination: SceneExportDestination): StoryExportMode = when (destination) {
        SceneExportDestination.GALLERY -> StoryExportMode.SAVE
        SceneExportDestination.SHARE -> StoryExportMode.SHARE
    }
}
