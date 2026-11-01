package me.meeshy.app.stories

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerObjectEditorSection
import me.meeshy.ui.icons.MeeshyIcons

internal const val SOUND_BAND_TAG = "composer-sound-band"

/** Ce qui pose une bande au bas de la scène pour le son posé : une de ses sections (Couper), ou son Volume (#14083). */
internal sealed interface PlacedSoundTool {
    data class Section(val section: ComposerObjectEditorSection) : PlacedSoundTool
    data object Volume : PlacedSoundTool
}

private fun PlacedSoundTool.glyph(): ImageVector = when (this) {
    is PlacedSoundTool.Section -> section.glyph()
    PlacedSoundTool.Volume -> MeeshyIcons.VolumeUp
}

private fun PlacedSoundTool.labelRes(): Int = when (this) {
    is PlacedSoundTool.Section -> section.labelRes()
    PlacedSoundTool.Volume -> R.string.composer_edit_volume
}

/**
 * Les outils du son posé sélectionné, À PLAT dans son rail avant Dupliquer · Temps · Retirer (#14047, #14083), comme iOS :
 * Couper, quand sa source est connue, puis Volume et Muet. Couper et Volume posent leur bande au bas de la scène ([onBand]),
 * Muet coupe aussitôt et rend le niveau quitté au second toucher, sa pastille allumée tant que le son est coupé. `null`
 * quand la sélection n'est pas un son.
 */
internal fun StoryComposerUiState.soundRailTools(viewModel: StoryComposerViewModel, onBand: (PlacedSoundTool) -> Unit): List<RailTool>? {
    val sound = selectedSound ?: return null
    val sections = (servedSoundSections - ComposerObjectEditorSection.Plan - ComposerObjectEditorSection.Timing).map { section ->
        val tool = PlacedSoundTool.Section(section)
        RailTool(tool.glyph(), tool.labelRes()) {
            viewModel.onSceneReduce { StoryComposerTrailingReducer.sectionOpened(it, section) }
            onBand(tool)
        }
    }
    val volume = RailTool(PlacedSoundTool.Volume.glyph(), PlacedSoundTool.Volume.labelRes()) { onBand(PlacedSoundTool.Volume) }
    val mute = RailTool(MeeshyIcons.VolumeOff, R.string.composer_edit_mute, active = sound.volume == 0f) { viewModel.onToggleSoundMute(sound.id) }
    return sections + volume + mute
}

/** L'outil du son dont la bande est posée, tant que le son reste sélectionné. */
internal fun EditingLevels<StoryEditingLevel>.soundBand(state: StoryComposerUiState): PlacedSoundTool? =
    (stack.top as? StoryEditingLevel.SoundBand)?.tool?.takeIf { state.selectedSound != null }

/** Le titre de l'outil du son dont la bande est posée, au-dessus de son rail. */
@Composable
internal fun SoundLevelContent(level: StoryEditingLevel) {
    if (level is StoryEditingLevel.SoundBand) SceneLevelTitle(level.tool.glyph(), stringResource(level.tool.labelRes()))
}

/** La bande de l'outil ouvert du son posé : sa fenêtre dans la source, ou son niveau de 0 à 100 %. */
@Composable
internal fun SoundBand(tool: PlacedSoundTool, state: StoryComposerUiState, viewModel: StoryComposerViewModel) {
    val sound = state.selectedSound ?: return
    Column(Modifier.fillMaxWidth().testTag(SOUND_BAND_TAG)) {
        when (tool) {
            PlacedSoundTool.Volume -> ComposerVolumeRow(sound.volume, { v ->
                viewModel.onSceneGesture("sound-volume-${sound.id}") { s -> s.withDeckTransform { it.withSelectedSoundVolume(sound.id, v) } }
            })
            is PlacedSoundTool.Section -> SoundSectionContent(state, sound, viewModel)
        }
    }
}
