package me.meeshy.app.stories

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.ime
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.composer.StoryCanvasFraming

/**
 * The body of the story composer — slide strip, stage (scene, footer, panel) and tool band — shared by the two
 * presentations: the stand-alone screen (a Scaffold around it, the audience pill on top) and the host's plateau (the
 * chrome lives in the corridors, so [onOpenAudience] is null and nothing sits above the strip).
 */
@Composable
internal fun StoryComposerBody(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    sceneExport: SceneExportHost,
    panel: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    onOpenAudience: (() -> Unit)? = null,
    showsAddSlide: Boolean = true,
) {
    val keyboardVisible = WindowInsets.ime.getBottom(LocalDensity.current) > 0
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        onOpenAudience?.let { open ->
            AudiencePill(
                visibility = state.draft.visibility,
                count = state.draft.visibilityUserIds.size,
                onClick = open,
                modifier = Modifier.align(Alignment.End),
            )
        }
        if (!state.band.isChromeHidden) SlideStrip(
            deck = state.deck,
            onSelect = viewModel::onSelectSlide,
            onAdd = viewModel::onAddSlide,
            onDuplicate = viewModel::onDuplicateSelectedSlide,
            onRemove = viewModel::onRemoveSlide,
            onMove = viewModel::onMoveSlide,
            showsAdd = showsAddSlide,
        )
        ComposerStage(
            carded = StoryCanvasFraming.shouldCard(
                panelOpen = state.band.isPanelOpen &&
                    ComposerBandTools.showsPanel(state.isDrawingActive, state.isEditingTextElement),
                keyboardVisible = keyboardVisible,
                drawingActive = state.isDrawingActive,
            ),
            scene = { sceneModifier -> StoryComposerScene(state, viewModel, sceneExport, sceneModifier) },
            footer = { StoryComposerFooter(state, viewModel) },
            panel = panel,
            modifier = Modifier.fillMaxWidth().weight(1f),
        )
        if (!state.isDrawingActive) {
            ComposerToolBand(
                band = state.band,
                badges = ComposerBandTools.badges(
                    mediaCount = state.draft.mediaIds.size,
                    textCount = state.selectedSlideTextElements.size,
                    strokeCount = state.selectedSlideStrokes.size,
                    hasBackground = state.selectedSlideBackground != null,
                    soundCount = state.selectedSlideAudio.size,
                ),
                onToolTap = viewModel::onBandToolTap,
                onToolSwipeUp = viewModel::onBandToolSwipeUp,
                onHideChrome = viewModel::onBandSwipeDown,
                onShowChrome = viewModel::onBandShowChrome,
            )
        }
    }
}
