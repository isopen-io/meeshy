package me.meeshy.app.stories

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.AdjustmentFamily
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.SceneObjectMenu
import me.meeshy.sdk.model.composer.edit.ComposerPlacedBackgroundOffer
import me.meeshy.sdk.model.composer.edit.ComposerPlacedMediaEditLevel
import me.meeshy.sdk.model.composer.edit.ComposerPlacedMediaTool
import me.meeshy.sdk.model.composer.look.ComposerCropPreset
import me.meeshy.sdk.model.composer.look.ComposerLookFamily
import me.meeshy.ui.component.retouch.ComposerMediaLookPanel
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing

internal const val PLACED_BAND_TAG = "composer-placed-band"
internal const val PLACED_MUTE_TAG = "composer-placed-mute"
internal const val PLACED_VOLUME_TAG = "composer-placed-volume"

internal fun ComposerPlacedMediaTool.glyph(): ImageVector = composerEditIcon(ComposerPlacedMediaEditLevel.entryOf(this).material) ?: MeeshyIcons.Edit

internal fun ComposerPlacedMediaTool.labelRes(): Int = when (this) {
    ComposerPlacedMediaTool.CROP -> R.string.composer_column_media_crop
    ComposerPlacedMediaTool.TRIM -> R.string.composer_edit_trim
    ComposerPlacedMediaTool.FILTERS -> R.string.composer_column_media_filter
    ComposerPlacedMediaTool.FRAMES -> R.string.composer_edit_frames
    ComposerPlacedMediaTool.ADJUST -> R.string.composer_column_media_adjust
    ComposerPlacedMediaTool.EFFECTS -> R.string.stories_composer_band_effets
    ComposerPlacedMediaTool.SOUND -> R.string.composer_capture_tool_sound
    ComposerPlacedMediaTool.ROTATE -> R.string.composer_edit_rotate
    ComposerPlacedMediaTool.DESCRIPTION -> R.string.composer_column_media_alt_text
    ComposerPlacedMediaTool.SET_AS_BACKGROUND -> R.string.composer_selection_set_background
    ComposerPlacedMediaTool.REPLACE_BACKGROUND -> R.string.composer_selection_replace_background
    ComposerPlacedMediaTool.MAKE_STICKER -> R.string.story_sticker_make
}

/** Les outils de l'image ou de la vidéo posée, vus de l'hôte (#13973, A-E4, à plat depuis #14047) : ses entrées, dans l'ordre de l'arbre partagé, et ce que fait chacune. */
internal class PlacedTools(val mediaId: String, val tools: List<ComposerPlacedMediaTool>, val onTool: (ComposerPlacedMediaTool) -> Unit)

/** Ce que la diapo laisse faire du fond au média posé : la barre de la sélection le dit déjà (Mettre en fond, ou Remplacer le fond). */
private fun SceneSelectionBar.backgroundOffer(): ComposerPlacedBackgroundOffer = when {
    SceneObjectMenu.Action.REPLACE_BACKGROUND in sheetActions -> ComposerPlacedBackgroundOffer.REPLACE
    SceneObjectMenu.Action.SET_AS_BACKGROUND in sheetActions -> ComposerPlacedBackgroundOffer.SET
    else -> ComposerPlacedBackgroundOffer.NONE
}

/** Les outils du média posé [id] ; [stickerServed] : la découpe de son sujet est servie sur l'appareil. */
internal fun StoryComposerUiState.placedEditTools(id: String, bar: SceneSelectionBar, stickerServed: Boolean): List<ComposerPlacedMediaTool> =
    ComposerPlacedMediaEditLevel.tools(
        ComposerPlacedMediaEditLevel.Media(
            video = placedMediaIsVideo(id),
            trimmable = placedTrimSourceOf(id) != null,
            look = offersLook(id),
            background = bar.backgroundOffer(),
            sticker = stickerServed,
        ),
    )

/**
 * Les outils du média POSÉ sélectionné, à plat dans son rail (#14047), ou `null` quand la sélection n'en est pas un : chaque réglage pose sa bande
 * au-dessus du niveau ([onBand]), Pivoter, Mettre en fond et Faire un sticker agissent aussitôt, Décrire ouvre sa feuille.
 */
@Composable
internal fun rememberPlacedTools(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    bar: SceneSelectionBar?,
    onBand: (ComposerPlacedMediaTool) -> Unit,
    onDescribe: () -> Unit,
): PlacedTools? {
    val id = bar?.ref?.takeIf { it.kind == ComposerObjectKind.MEDIA }?.id?.takeIf { ref -> state.deck.selectedSlide.placedMedia.any { it.id == ref } }
    val lift = rememberStickerLift(state, id, viewModel)
    if (bar == null || id == null) return null
    return PlacedTools(id, state.placedEditTools(id, bar, stickerServed = lift != null)) { tool ->
        when (tool) {
            ComposerPlacedMediaTool.ROTATE -> viewModel.onSceneReduce { StoryComposerPlacedMediaReducer.rotated(it, id) }
            ComposerPlacedMediaTool.SET_AS_BACKGROUND -> viewModel.onObjectController(bar.ref, SceneObjectMenu.Action.SET_AS_BACKGROUND)
            ComposerPlacedMediaTool.REPLACE_BACKGROUND -> viewModel.onObjectController(bar.ref, SceneObjectMenu.Action.REPLACE_BACKGROUND)
            ComposerPlacedMediaTool.MAKE_STICKER -> lift?.invoke()
            ComposerPlacedMediaTool.DESCRIPTION -> onDescribe()
            else -> onBand(tool)
        }
    }
}

/** Les outils du média posé, en entrées du rail à plat, avant Dupliquer · Temps · Retirer (#14047). */
internal fun PlacedTools.railTools(): List<RailTool> = tools.map { tool -> RailTool(tool.glyph(), tool.labelRes()) { onTool(tool) } }

/** Le titre du réglage du média posé dont la bande est posée, au-dessus de son rail. */
@Composable
internal fun PlacedLevelContent(level: StoryEditingLevel) {
    if (level is StoryEditingLevel.ObjectBand) SceneLevelTitle(level.tool.glyph(), stringResource(level.tool.labelRes()))
}

/** Le réglage dont la bande est posée, s'il est encore offert par le média posé sélectionné ; sinon aucune bande. */
internal fun EditingLevels<StoryEditingLevel>.placedBand(tools: PlacedTools?): ComposerPlacedMediaTool? =
    (stack.top as? StoryEditingLevel.ObjectBand)?.tool?.takeIf { tools != null && it in tools.tools }

/**
 * Recadrer par le geste : le média posé dont la bande Recadrer est ouverte prend le glisser et le pincement pour sa fenêtre
 * dans la source, plus pour sa pose (#13973, A-E4) — sans équerre dessinée, l'image se recadre sous le doigt.
 */
internal class PlacedReframe(val mediaId: String, val onReframe: (panX: Float, panY: Float, zoom: Float) -> Unit)

internal val LocalPlacedReframe = compositionLocalOf<PlacedReframe?> { null }

internal fun placedReframe(tool: ComposerPlacedMediaTool?, tools: PlacedTools?, viewModel: StoryComposerViewModel): PlacedReframe? {
    if (tool != ComposerPlacedMediaTool.CROP || tools == null) return null
    val id = tools.mediaId
    return PlacedReframe(id) { panX, panY, zoom ->
        viewModel.onSceneGesture("crop-$id") { StoryComposerPlacedMediaReducer.reframed(it, id, panX.toDouble(), panY.toDouble(), zoom.toDouble()) }
    }
}

/**
 * La bande du réglage ouvert du média posé, au bas de la scène qui se réduit au-dessus (#13973, A-E4) : les proportions de
 * Recadrer (le cadre lui-même se règle sur la scène), Couper, Filtres, Cadres, Réglages, Effets, Son. Chaque geste écrit sa
 * valeur à chaque image : la scène se repeint pendant le geste.
 */
@Composable
internal fun PlacedMediaBand(tool: ComposerPlacedMediaTool, mediaId: String, state: StoryComposerUiState, viewModel: StoryComposerViewModel, comparison: LookComparison) {
    Column(Modifier.fillMaxWidth().testTag(PLACED_BAND_TAG), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        when (tool) {
            ComposerPlacedMediaTool.CROP -> CropPresets(state, mediaId, viewModel)
            ComposerPlacedMediaTool.TRIM -> PlacedTrimSection(state, mediaId, viewModel)
            ComposerPlacedMediaTool.FILTERS -> {
                FilterRow(state.placedFilterOf(mediaId), 1f, { viewModel.onSelectPlacedMediaFilter(mediaId, it) }, onIntensityChange = null)
                if (state.offersLook(mediaId)) PlacedLooks(state, mediaId, viewModel, ComposerLookFamily.FILTERS)
            }
            ComposerPlacedMediaTool.FRAMES -> PlacedLooks(state, mediaId, viewModel, ComposerLookFamily.FRAMES)
            ComposerPlacedMediaTool.ADJUST -> AdjustSection(state, mediaId, AdjustmentFamily.TONE, viewModel, comparison)
            ComposerPlacedMediaTool.EFFECTS -> AdjustSection(state, mediaId, AdjustmentFamily.EFFECT, viewModel, comparison)
            ComposerPlacedMediaTool.SOUND -> PlacedVolume(state, mediaId, viewModel)
            else -> Unit
        }
    }
}

@Composable
private fun PlacedLooks(state: StoryComposerUiState, id: String, viewModel: StoryComposerViewModel, family: ComposerLookFamily) {
    ComposerMediaLookPanel(
        look = state.mediaLookOf(id),
        onChoose = { item -> viewModel.onSceneReduce { StoryComposerLookReducer.chosen(it, id, item) } },
        families = listOf(family),
    )
}

/** Les proportions du recadrage (« Original », 9:16, 4:5, 1:1, 16:9) : le plus grand cadre centré, que le doigt déplace ensuite sur la scène. */
@Composable
private fun CropPresets(state: StoryComposerUiState, mediaId: String, viewModel: StoryComposerViewModel) {
    val chosen = state.placedCropPresetOf(mediaId)
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        ComposerCropPreset.entries.forEach { preset ->
            FilterChip(
                selected = preset == chosen,
                onClick = { viewModel.onSceneReduce { StoryComposerPlacedMediaReducer.preset(it, mediaId, preset) } },
                label = { Text(preset.notation ?: stringResource(me.meeshy.ui.R.string.retouch_crop_original)) },
                modifier = Modifier.heightIn(min = 48.dp),
            )
        }
    }
}

/** Son › Volume et Muet de la vidéo posée : le curseur écrit le volume à chaque valeur, Muet coupe et rend le niveau quitté. */
@Composable
private fun PlacedVolume(state: StoryComposerUiState, mediaId: String, viewModel: StoryComposerViewModel) {
    val placed = state.deck.selectedSlide.placedMedia.firstOrNull { it.id == mediaId } ?: return
    val label = stringResource(R.string.composer_edit_volume)
    val percent = "${(placed.volume * 100).roundToInt()} %"
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Slider(
            value = placed.volume,
            onValueChange = { v -> viewModel.onSceneGesture("volume-$mediaId") { StoryComposerPlacedMediaReducer.volumeSet(it, mediaId, v) } },
            valueRange = 0f..1f,
            colors = SliderDefaults.colors(thumbColor = MaterialTheme.colorScheme.primary, activeTrackColor = MaterialTheme.colorScheme.primary),
            modifier = Modifier.weight(1f).defaultMinSize(minHeight = 48.dp).testTag(PLACED_VOLUME_TAG).semantics {
                contentDescription = label
                stateDescription = percent
            },
        )
        FilterChip(
            selected = placed.isMuted,
            onClick = { viewModel.onSceneReduce { StoryComposerPlacedMediaReducer.muteToggled(it, mediaId) } },
            label = { Text(stringResource(R.string.composer_edit_mute)) },
            modifier = Modifier.heightIn(min = 48.dp).testTag(PLACED_MUTE_TAG),
        )
    }
}
