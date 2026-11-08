package me.meeshy.app.stories

import androidx.compose.runtime.State
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics

/**
 * Propriétaire : lot story-viewer-decomposition-and-nav-graph. Les gestes de toucher de la scène : tap par
 * zone, double tap au centre (pause / lecture), appui long (pause qui tient au relâchement). Le glissé de la
 * carte vit dans `StoryCardGesture`. Un lot qui ajoute un geste de toucher édite CE fichier.
 */
internal fun Modifier.storyCanvasGestures(
    groupIndex: Int,
    index: Int,
    slideCount: Int,
    surfaceOpen: State<Boolean>,
    composerEngaged: State<Boolean>,
    onCloseSurfaces: () -> Unit,
    onDismissComposer: () -> Unit,
    onNavigate: () -> Unit,
    viewModel: StoryViewerViewModel,
    resetToken: Int = 0,
): Modifier = pointerInput(groupIndex, index, slideCount, resetToken) {
    detectStoryCanvasTaps(
        context = {
            StoryGestureContext(
                isPaused = viewModel.isHeldPaused,
                isComposerEngaged = composerEngaged.value,
                isSurfaceOpen = surfaceOpen.value,
            )
        },
        onHold = viewModel::toggleByHold,
    ) { action ->
        when (action) {
            StoryGestureAction.ResumeFromPause -> viewModel.resumeFromTouch()
            StoryGestureAction.NavigatePrevious -> { onNavigate(); viewModel.onCanvasTap(StoryTapZone.Previous) }
            StoryGestureAction.NavigateNext -> { onNavigate(); viewModel.onCanvasTap(StoryTapZone.Next) }
            StoryGestureAction.TogglePause -> viewModel.onCanvasDoubleTap()
            StoryGestureAction.CloseSurface -> onCloseSurfaces()
            StoryGestureAction.DismissComposer -> onDismissComposer()
            StoryGestureAction.ConfirmLongPressPause, StoryGestureAction.None -> Unit
        }
    }
}

/** Actions TalkBack nommées de la scène : « Story suivante » et « Story précédente » (iOS). */
internal fun Modifier.storyNavigationActions(
    nextLabel: String,
    previousLabel: String,
    onNext: () -> Unit,
    onPrevious: () -> Unit,
): Modifier = semantics {
    customActions = listOf(
        CustomAccessibilityAction(nextLabel) { onNext(); true },
        CustomAccessibilityAction(previousLabel) { onPrevious(); true },
    )
}
