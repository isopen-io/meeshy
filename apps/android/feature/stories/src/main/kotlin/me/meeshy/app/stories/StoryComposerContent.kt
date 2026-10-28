package me.meeshy.app.stories

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/**
 * The story body of the ONE composer: [StoryComposerScreen] mounted as a CONTENT of the host. The scene
 * survives a round trip through another format (the ViewModel belongs to the host's back-stack entry);
 * [seedText] is what the author already wrote under another format, carried in when the caption is empty.
 * [onFacts] reports the text and whether a scene exists, so the host lets the other formats breathe.
 */
@Composable
fun StoryComposerContent(
    seedText: String,
    onFacts: (text: String, hasScene: Boolean) -> Unit,
    onClose: () -> Unit,
    titleContent: @Composable () -> Unit,
    viewModel: StoryComposerViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    StoryComposerScreen(onClose = onClose, titleContent = titleContent, viewModel = viewModel)
    // After the screen: its own draft restore has run, so a carried text never clobbers a restored one.
    LaunchedEffect(Unit) {
        if (seedText.isNotBlank() && state.editorText.isBlank()) viewModel.onTextChange(seedText)
    }
    val hasScene = state.selectedSlideAttachments.isNotEmpty() || state.selectedSlidePending.isNotEmpty() ||
        state.selectedSlideTextElements.isNotEmpty() || state.selectedSlideStickers.isNotEmpty() ||
        state.selectedSlideStrokes.isNotEmpty() || state.selectedSlideBackground != null
    LaunchedEffect(state.editorText, hasScene) { onFacts(state.editorText, hasScene) }
}
