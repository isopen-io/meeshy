package me.meeshy.app.stories

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.sdk.model.composer.CarriedMedia
import me.meeshy.sdk.model.composer.ComposerCarry

/**
 * The story body of the ONE composer: [StoryComposerScreen] mounted as a CONTENT of the host. The scene
 * survives a round trip through another format (the ViewModel belongs to the host's back-stack entry);
 * [seedText] is what the author already wrote under another format: their LATEST words, whichever format
 * they were typed under, carried in.
 * [onFacts] reports the text and whether a scene exists, so the host lets the other formats breathe.
 */
@Composable
fun StoryComposerContent(
    seedText: String,
    onFacts: (StoryComposerFacts) -> Unit,
    carry: ComposerCarry? = null,
    onCarryApplied: (token: Int, lost: Int) -> Unit = { _, _ -> },
    onClose: () -> Unit,
    titleContent: @Composable () -> Unit,
    viewModel: StoryComposerViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    StoryComposerScreen(onClose = onClose, titleContent = titleContent, viewModel = viewModel)
    // After the screen: its own draft restore has run. The host's text is the latest the author typed, under any
    // format; an empty one (a fresh door) never clobbers a restored draft.
    LaunchedEffect(Unit) {
        if (seedText.isNotBlank() && seedText != state.editorText) viewModel.onTextChange(seedText)
    }
    val hasScene = state.selectedSlideAttachments.isNotEmpty() || state.selectedSlidePending.isNotEmpty() ||
        state.selectedSlideTextElements.isNotEmpty() || state.selectedSlideStickers.isNotEmpty() ||
        state.selectedSlideStrokes.isNotEmpty() || state.selectedSlideBackground != null
    LaunchedEffect(carry?.token) {
        carry?.takeIf { it.target == ComposerCarry.Side.SCENE }?.let { viewModel.onCarry(it) { lost -> onCarryApplied(it.token, lost) } }
    }
    LaunchedEffect(state.editorText, hasScene, state.carriedMedia, state.carriedPending, state.draft.visibility) {
        onFacts(
            StoryComposerFacts(
                text = state.editorText,
                hasScene = hasScene,
                media = state.carriedMedia,
                pending = state.carriedPending,
                room = state.deck.selectedRemainingMediaSlots,
                visibility = state.draft.visibility,
            ),
        )
    }
}

/** What the host needs to know about the scene: its text, whether it exists, and its media (the document's other half). */
data class StoryComposerFacts(
    val text: String,
    val hasScene: Boolean,
    val media: List<CarriedMedia>,
    val pending: Int,
    val room: Int,
    val visibility: StoryVisibility,
)
