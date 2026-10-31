package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.material3.DropdownMenu
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.fullscreen.FullscreenChromeSymbol
import me.meeshy.sdk.model.scene.export.StoryExportMode
import me.meeshy.ui.component.fullscreen.FullscreenChromeButton
import me.meeshy.ui.component.fullscreen.icon

/**
 * Le menu « … » du plein écran d'un post à scène (#13896) : Enregistrer, Partager et Imager rendent le post ENTIER, ses
 * [scenes] bout à bout, par le moteur de la story. Imager propose la longueur au-delà d'une minute ; les deux autres rendent tout.
 */
@Composable
fun PostSceneExportMenu(
    scenes: List<StoryItem>,
    accentHex: String?,
    modifier: Modifier = Modifier,
    viewModel: RepostSceneViewModel = hiltViewModel(),
) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    val accent = accentHex ?: EXPORT_FALLBACK_ACCENT
    val projected = remember(scenes, accent) { scenes.map { it to viewModel.slideOf(it, accentHex = accent) } }
    val current by rememberUpdatedState(projected)
    val export = rememberSceneVideoExport { current }
    Box(modifier) {
        FullscreenChromeButton(
            icon = FullscreenChromeSymbol.More.icon,
            label = stringResource(R.string.stories_scene_overflow_menu),
            onClick = { expanded = true },
            isActive = expanded,
        )
        DropdownMenu(expanded = expanded && !export.busy, onDismissRequest = { expanded = false }) {
            StoryVideoExportMenuEntries(onPick = { mode ->
                expanded = false
                export.start(mode)
            })
        }
    }
}

private const val EXPORT_FALLBACK_ACCENT = "6366F1"

/**
 * L'export d'une scène qu'un geste choisit (#13915) — le média d'une visionneuse de commentaire : la scène est projetée au
 * geste par la projection du lecteur, puis rendue par le moteur de la story sous [key].
 */
@Composable
fun rememberStoryItemExport(key: String, accentHex: String? = null): (StoryItem, StoryExportMode) -> Unit {
    val projector: RepostSceneViewModel = hiltViewModel()
    val accent = accentHex ?: EXPORT_FALLBACK_ACCENT
    val export = rememberSceneVideoExport(key) { emptyList() }
    val current by rememberUpdatedState(export)
    return remember(projector, accent) { { item, mode -> current.start(mode, listOf(item to projector.slideOf(item, accentHex = accent))) } }
}

