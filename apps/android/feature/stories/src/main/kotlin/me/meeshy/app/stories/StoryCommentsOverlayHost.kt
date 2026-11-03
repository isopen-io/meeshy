package me.meeshy.app.stories

import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import me.meeshy.app.feed.PostCommentsViewModel

/**
 * Propriétaire : lot story-viewer-decomposition-and-nav-graph. Le bas de la scène : la légende de la slide et le
 * composeur de commentaire épinglé (iOS `composerLayer`, #14313). Un lot qui pose autre chose sous la story
 * (réponse rapide, bandeau de jeu) l'ajoute ICI.
 */
@Composable
internal fun BoxScope.StoryCommentsOverlayHost(
    slide: StorySlideView?,
    commentThread: PostCommentsViewModel?,
    composerPinned: Boolean,
    onComposerHeight: (Int) -> Unit,
) {
    var composerHeightPx by remember { mutableIntStateOf(0) }
    if (slide != null && slide.text.isNotBlank()) {
        StoryCaptionOverlay(
            text = slide.text,
            storyId = slide.id,
            bottomInset = with(LocalDensity.current) { composerHeightPx.toDp() },
        )
    }
    Column(Modifier.align(Alignment.BottomStart).fillMaxWidth()) {
        // #14313 — le composeur de commentaire épinglé sous la story d'autrui (iOS `composerLayer`).
        if (composerPinned && commentThread != null) {
            StoryPinnedCommentComposer(
                thread = commentThread,
                modifier = Modifier.onSizeChanged {
                    composerHeightPx = it.height
                    onComposerHeight(it.height)
                },
            )
            StoryCommentSentFeedback(thread = commentThread)
        }
    }
}
