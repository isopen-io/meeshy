package me.meeshy.app.stories

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import me.meeshy.sdk.model.composer.ComposerObjectEditorSection

internal const val SOUND_BAND_TAG = "composer-sound-band"

/**
 * Les outils du son posé sélectionné, À PLAT dans son rail avant Dupliquer · Temps · Retirer (#14047) — plus de feuille
 * « Modifier » à pastilles : Couper, quand sa source est connue, ouvre sa bande au bas de la scène ([onBand]) ; son départ et
 * sa durée sont ceux du Temps qui le suit, le plan n'est plus une section. `null` quand la sélection n'est pas un son.
 */
internal fun StoryComposerUiState.soundRailTools(viewModel: StoryComposerViewModel, onBand: (ComposerObjectEditorSection) -> Unit): List<RailTool>? {
    selectedSound ?: return null
    return (servedSoundSections - ComposerObjectEditorSection.Plan - ComposerObjectEditorSection.Timing).map { section ->
        RailTool(section.glyph(), section.labelRes()) {
            viewModel.onSceneReduce { StoryComposerTrailingReducer.sectionOpened(it, section) }
            onBand(section)
        }
    }
}

/** La section du son dont la bande est posée, tant que le son reste sélectionné. */
internal fun EditingLevels<StoryEditingLevel>.soundBand(state: StoryComposerUiState): ComposerObjectEditorSection? =
    (stack.top as? StoryEditingLevel.SoundBand)?.section?.takeIf { state.selectedSound != null }

/** Le titre de la section du son dont la bande est posée, au-dessus de son rail. */
@Composable
internal fun SoundLevelContent(level: StoryEditingLevel) {
    if (level is StoryEditingLevel.SoundBand) SceneLevelTitle(level.section.glyph(), stringResource(level.section.labelRes()))
}

/** La bande de la section ouverte du son posé : sa fenêtre dans la source, ou son départ et sa durée. */
@Composable
internal fun SoundBand(state: StoryComposerUiState, viewModel: StoryComposerViewModel) {
    val sound = state.selectedSound ?: return
    Column(Modifier.fillMaxWidth().testTag(SOUND_BAND_TAG)) { SoundSectionContent(state, sound, viewModel) }
}
