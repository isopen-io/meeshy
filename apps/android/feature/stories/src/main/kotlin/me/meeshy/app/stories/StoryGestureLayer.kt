package me.meeshy.app.stories

import androidx.compose.runtime.State
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput

/**
 * Propriétaire : lot story-viewer-decomposition-and-nav-graph. Les gestes de toucher de la scène : tap par
 * zone, double tap au centre (cœur), appui long (pause qui tient au relâchement). Le glissé de la carte vit dans
 * `StoryCardGesture`. Un lot qui ajoute un geste de toucher édite CE fichier.
 */
internal fun Modifier.storyCanvasGestures(
    groupIndex: Int,
    index: Int,
    slideCount: Int,
    overlayActive: State<Boolean>,
    onCloseBars: () -> Unit,
    viewModel: StoryViewerViewModel,
): Modifier = pointerInput(groupIndex, index, slideCount) {
    // Appui long ≥ 200 ms = pause qui tient au relâchement ; le tap suivant
    // reprend sans naviguer (iOS `StoryGestureOverlayView`).
    detectStoryCanvasTaps(
        isDoubleTapZone = { StoryTapZone.of(it.x, size.width.toFloat()) == StoryTapZone.Center },
        onDoubleTap = { if (!overlayActive.value) viewModel.onCanvasDoubleTap() },
        onHold = { if (!overlayActive.value) viewModel.toggleByHold() },
    ) { offset ->
        if (overlayActive.value) {
            onCloseBars()
        } else {
            viewModel.onCanvasTap(StoryTapZone.of(offset.x, size.width.toFloat()))
        }
    }
}
