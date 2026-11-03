package me.meeshy.app.stories

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationVector1D
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import me.meeshy.app.feed.PostCommentsViewModel
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.EmojiCatalog
import me.meeshy.sdk.model.StoryItem
import me.meeshy.ui.component.FeedbackToastHost
import me.meeshy.sdk.model.scene.export.StoryExportMode
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

/**
 * Propriétaire : lot story-viewer-decomposition-and-nav-graph. La coque du lecteur : la carte (cube, glissé, gestes),
 * l'ordre des couches (scène, légende, en-tête, rail, barres, toasts) et le câblage entre elles. Elle ne décide
 * rien : chaque couche vit dans son fichier emplacement. Un lot qui ajoute une couche l'insère ICI en UNE ligne.
 */
@Composable
internal fun StoryViewerShell(
    state: StoryViewerUiState,
    slide: StorySlideView?,
    accent: String,
    slideDurationMs: Int,
    progress: Animatable<Float, AnimationVector1D>,
    playing: Boolean,
    lap: Int,
    waiting: Boolean,
    composing: Boolean,
    railPlan: StoryRailPlan,
    commentThread: PostCommentsViewModel?,
    commentCount: Int,
    currentItem: StoryItem?,
    keyboardVisible: Boolean,
    cardMotion: StoryCardMotion,
    rail: StoryRailController,
    chrome: StoryViewerChromeState,
    videoExport: StoryVideoExport,
    actions: StoryViewerActions,
    haptics: MeeshyHaptics,
    viewModel: StoryViewerViewModel,
) {
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()
    var headerHeightPx by remember { mutableIntStateOf(0) }
    var composerHeightPx by remember { mutableIntStateOf(0) }
    val overlayActiveState = rememberUpdatedState(rail.overlayActive)
    val hasNextGroupState = rememberUpdatedState(state.hasNextGroup)
    val hasPreviousGroupState = rememberUpdatedState(state.hasPreviousGroup)
    StoryCubeEntryOnAuthorChange(cardMotion, authorKey = state.authorUserId, groupIndex = state.groupIndex)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .storyCanvasGestures(
                groupIndex = state.groupIndex,
                index = state.index,
                slideCount = state.slides.size,
                overlayActive = overlayActiveState,
                onCloseBars = rail::closeBars,
                viewModel = viewModel,
            )
            .storyCardDrag(
                motion = cardMotion,
                scope = scope,
                hasNextGroup = hasNextGroupState,
                hasPreviousGroup = hasPreviousGroupState,
                overlayActive = overlayActiveState,
                onOverlayDismiss = rail::closeBars,
                onCommit = viewModel::onSwipe,
                onCommitFeedback = haptics::light,
            ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .storyCardFrame(cardMotion)
                .background(hexColor(accent))
                .onGloballyPositioned { rail.boxOriginInRoot = it.positionInRoot() },
        ) {
            if (slide != null) {
                StoryViewerCanvas(slide, progress, slideDurationMs, playing, state.isMuted, lap, viewModel)
            }

            StoryStallIndicator(waiting = waiting, modifier = Modifier.align(Alignment.Center))

            val composerPinned = commentThread != null && railPlan.pinsCommentComposer && slide != null &&
                !state.isDismissed && (!state.isPaused || composing)
            StoryCommentsOverlayHost(
                slide = slide,
                commentThread = commentThread,
                composerPinned = composerPinned,
                onComposerHeight = { composerHeightPx = it },
            )

            if (!state.isPaused) {
                StoryViewerTopBar(
                    state = state,
                    slide = slide,
                    accent = accent,
                    progress = { progress.value },
                    chrome = chrome,
                    showsRepost = railPlan.showsRepost,
                    videoExport = videoExport,
                    actions = actions,
                    haptics = haptics,
                    viewModel = viewModel,
                    onHeight = { headerHeightPx = it },
                )
            }

            val railFrame = StoryRailFrame.of(headerHeightPx, composerHeightPx, composerPinned, with(density) { MeeshySpacing.sm.roundToPx() })
            if (slide != null && !state.isDismissed && !state.isPaused && !keyboardVisible) {
                StoryActionRail(
                    plan = railPlan,
                    counts = StoryRailCounts(
                        comments = commentCount,
                        shares = currentItem?.shareCount ?: 0,
                        reposts = state.repostCount,
                        reposted = state.hasReposted,
                        views = currentItem?.viewCount ?: 0,
                    ),
                    taps = StoryRailTaps(
                        onSend = { rail.closeBars(); haptics.light(); actions.openSendTo() },
                        onRepost = { rail.closeBars(); actions.repost() },
                        onViews = { rail.closeBars(); haptics.light(); chrome.showViewers = true },
                        onCompose = { rail.closeBars(); haptics.light(); state.currentStoryId?.let { id -> actions.onComposeStory?.invoke(id) } },
                        onComments = { rail.closeBars(); haptics.light(); chrome.showComments = true },
                        onToggleSound = { haptics.light(); viewModel.toggleMute() },
                        onSave = { rail.closeBars(); haptics.light(); videoExport.start(StoryExportMode.SAVE) },
                    ),
                    emphasis = rememberStoryRailEmphasis(state, rail, chrome, commentThread, videoExport.busy),
                    reactionCount = state.reactionCount,
                    hasReacted = state.myReactions.isNotEmpty(),
                    languageBadgeCode = state.activeLanguageCode,
                    heartBouncePulse = rail.heartBouncePulse,
                    onTapHeart = { rail.sendReaction(EmojiCatalog.DOUBLE_TAP_EMOJI, from = rail.heartBounds) },
                    onTapLanguage = rail::toggleLanguageBar,
                    onTapReply = {
                        rail.closeBars()
                        haptics.light()
                        chrome.showReply = true
                    },
                    onScrubEvent = rail::handleScrub,
                    onHeartBounds = { rail.heartBounds = it },
                    onLanguageBounds = { rail.languageButtonBounds = it },
                    modifier = Modifier
                        .align(Alignment.CenterEnd)
                        .padding(top = with(density) { railFrame.topPx.toDp() }, bottom = with(density) { railFrame.bottomPx.toDp() })
                        .padding(end = MeeshySpacing.sm),
                )
            }

            StoryRailBars(rail = rail, state = state, viewModel = viewModel)

            if (state.slides.isEmpty() && !state.isLoading) {
                Text(
                    text = stringResource(R.string.stories_empty),
                    color = MeeshyPalette.White,
                    modifier = Modifier.align(Alignment.Center),
                )
            }
            FeedbackToastHost(
                toasts = viewModel.toasts,
                modifier = Modifier.padding(bottom = with(density) { (if (composerPinned) composerHeightPx else 0).toDp() }),
            )
        }
    }
}
