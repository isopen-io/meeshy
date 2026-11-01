package me.meeshy.app.stories

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import me.meeshy.sdk.model.composer.scene.ComposerOverflowEntry

/**
 * L'export du compositeur vu de l'écran (#13897) : ses entrées (Enregistrer, Partager) et leur lancement. Le rendu, le
 * bandeau qui le suit et la remise du fichier (galerie, partage) sont ceux de l'export des stories
 * ([rememberSceneVideoExport]) ; les scènes se lisent au moment du geste, toutes les slides publiables à la fois.
 */
@Stable
internal class SceneExportHost(
    val entries: List<ComposerOverflowEntry>,
    val isExporting: Boolean,
    private val startExport: (ComposerOverflowEntry) -> Unit,
) {
    fun start(entry: ComposerOverflowEntry) = startExport(entry)
}

@Composable
internal fun rememberSceneExportHost(state: StoryComposerUiState, viewModel: StoryComposerViewModel): SceneExportHost {
    val current by rememberUpdatedState(state)
    val export = rememberSceneVideoExport(key = COMPOSER_EXPORT_KEY) {
        val projector = StorySlideProjector(viewModel.mediaBaseUrl)
        ComposerSceneExport.scenes(current, viewModel.resolvePublishLanguage(), viewModel.authorFloor) { item ->
            projector.project(item, viewModel.authorAccentHex, NoContentPreferences)
        }
    }
    return SceneExportHost(
        entries = ComposerSceneExport.entries(state),
        isExporting = export.busy,
        startExport = { entry -> export.start(ComposerSceneExport.mode(entry.destination)) },
    )
}

private const val COMPOSER_EXPORT_KEY = "composer-scene-export"
