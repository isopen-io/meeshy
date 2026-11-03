package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import me.meeshy.app.feed.PostCommentsViewModel
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.story.StoryCaptionPlacement
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

internal const val STORY_TRANSCRIPT_TAG = "story.transcript"

/**
 * Propriétaire : lot story-viewer-decomposition-and-nav-graph. Le bas de la scène : la légende de la slide (ou la
 * transcription vocale qui la remplace) et le composeur de commentaire épinglé (iOS `composerLayer`, #14313). Un lot qui
 * pose autre chose sous la story (réponse rapide, bandeau de jeu) l'ajoute ICI.
 *
 * Le bas du texte épouse la hauteur MESURÉE du composeur ; sans composeur, ou chrome masqué, il se pose au ras du bas.
 * Déplier ou demander la transcription fait BOUCLER la story (cf. `StoryViewerCover.reading`) ; chaque changement de
 * slide replie l'un et l'autre.
 */
@Composable
internal fun BoxScope.StoryCommentsOverlayHost(
    slide: StorySlideView?,
    commentThread: PostCommentsViewModel?,
    composerPinned: Boolean,
    onComposerHeight: (Int) -> Unit,
    currentItem: StoryItem?,
    chrome: StoryViewerChromeState,
    haptics: MeeshyHaptics,
    viewModel: StoryViewerViewModel,
    chromeVisible: Boolean,
) {
    var composerHeightPx by remember { mutableIntStateOf(0) }
    LaunchedEffect(slide?.id) {
        chrome.captionExpanded = false
        chrome.transcript = chrome.transcript.onSlide(slide?.id)
    }
    val density = LocalDensity.current
    val composerBlockHeight = if (composerPinned && commentThread != null) composerHeightPx.toFloat() else null
    val bottomInset = with(density) {
        StoryCaptionPlacement.bottomInset(composerBlockHeight, composerBottomPadding = 0f, isComposerShown = chromeVisible).toDp()
    }
    val transcriptText = chrome.transcript.text(currentItem?.storyEffects, viewModel.transcriptLanguageChain())
    if (transcriptText != null) {
        StoryTranscriptCaption(transcriptText, bottomInset, Modifier.align(Alignment.BottomCenter))
    } else if (slide != null && slide.text.isNotBlank()) {
        StoryCaptionOverlay(
            text = slide.text,
            expanded = chrome.captionExpanded,
            onToggle = {
                haptics.light()
                chrome.captionExpanded = !chrome.captionExpanded
            },
            trackedLinks = currentItem?.trackedLinkMap,
            validUsernames = currentItem?.validMentionUsernames,
            bottomInset = bottomInset,
            topChromeReserve = with(density) {
                StoryCaptionPlacement.topChromeReserve(WindowInsets.statusBars.getTop(this).toFloat()).toDp()
            },
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

/** La transcription d'un vocal : un sous-titre centré sur un voile, qui ne prend aucun toucher (iOS `voiceCaptionLayer`). */
@Composable
private fun StoryTranscriptCaption(text: String, bottomInset: Dp, modifier: Modifier) {
    Text(
        text = text,
        color = MeeshyPalette.White,
        textAlign = TextAlign.Center,
        style = MaterialTheme.typography.labelLarge,
        modifier = modifier
            .padding(horizontal = MeeshySpacing.xl)
            .padding(bottom = bottomInset + MeeshySpacing.xl)
            .background(MeeshyMediaChromeColors.Scrim, RoundedCornerShape(MeeshyRadius.sm))
            .padding(horizontal = MeeshySpacing.xl, vertical = MeeshySpacing.sm)
            .testTag(STORY_TRANSCRIPT_TAG),
    )
}
