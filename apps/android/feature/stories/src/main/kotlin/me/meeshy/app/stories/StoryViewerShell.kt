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
import androidx.compose.ui.graphics.graphicsLayer
import me.meeshy.sdk.model.story.StoryComposingFocus
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import me.meeshy.app.feed.PostCommentsViewModel
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.EmojiCatalog
import me.meeshy.sdk.model.StoryItem
import me.meeshy.ui.component.FeedbackToastHost
import me.meeshy.sdk.model.scene.export.StoryExportMode
import me.meeshy.sdk.story.isExpired
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

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
    awaitingStart: Boolean,
    scrubber: StoryProgressScrubber,
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
    groupIntro: StoryGroupIntroUi,
) {
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()
    var headerHeightPx by remember { mutableIntStateOf(0) }
    var composerHeightPx by remember { mutableIntStateOf(0) }
    val surfaceOpenState = rememberUpdatedState(
        StoryReaderSurfaceRules.hasActiveReaderFeature(
            showLanguageOptions = rail.languageBarVisible,
            showFullLanguagePicker = state.languageExplorer != null,
            showEmojiStrip = rail.reactionBarVisible,
            showFullEmojiPicker = rail.showFullEmojiPicker,
            showCommentsOverlay = chrome.showComments,
        ),
    )
    val composerEngagedState = rememberUpdatedState(composing)
    val focusManager = LocalFocusManager.current
    val nextLabel = stringResource(R.string.stories_viewer_next)
    val previousLabel = stringResource(R.string.stories_viewer_previous)
    val hasNextGroupState = rememberUpdatedState(state.hasNextGroup)
    val hasPreviousGroupState = rememberUpdatedState(state.hasPreviousGroup)
    val dragFrames = remember { StoryDragFrameSource() }
    val closeSurfaces: () -> Unit = {
        rail.closeBars()
        rail.showFullEmojiPicker = false
        chrome.showComments = false
        viewModel.closeLanguageExplorer()
    }
    val chromeVisible = StoryFullscreenChrome.chromeVisible(isFullscreen = cardMotion.fullscreen.enabled, isHeld = state.isPaused)
    // Écrire un commentaire fait le silence (iOS StoryComposingFocus) : clavier ouvert sur le composeur épinglé.
    val isComposingFocus = keyboardVisible && commentThread != null && railPlan.pinsCommentComposer && slide != null && !state.isDismissed
    val chromeShown = StoryComposingFocus.showsChrome(chromeVisible = chromeVisible, isComposing = isComposingFocus)
    val chromeAlpha = storyFocusAlpha(chromeShown)
    StoryDragAxisRelease(cardMotion, groupIndex = state.groupIndex, index = state.index)
    StoryCubeEntryOnAuthorChange(cardMotion, authorKey = state.authorUserId, groupIndex = state.groupIndex)
    StoryCardAppearOnOpen(cardMotion)
    StoryViewerImmersiveMode()
    StoryCloseOnStop {
        viewModel.endCurrentDwell()
        actions.onClose()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .storyNavigationActions(nextLabel, previousLabel, onNext = viewModel::advance, onPrevious = viewModel::back)
            .storyCanvasGestures(
                groupIndex = state.groupIndex,
                index = state.index,
                slideCount = state.slides.size,
                surfaceOpen = surfaceOpenState,
                composerEngaged = composerEngagedState,
                onCloseSurfaces = closeSurfaces,
                onDismissComposer = { focusManager.clearFocus() },
                onNavigate = haptics::light,
                viewModel = viewModel,
                resetToken = cardMotion.resetToken,
            )
            .storyDragLayer(
                motion = cardMotion,
                scope = scope,
                frames = dragFrames,
                reactionBar = rail::openBarRegion,
                hasNextGroup = hasNextGroupState,
                hasPreviousGroup = hasPreviousGroupState,
                surfaceOpen = surfaceOpenState,
                composerEngaged = composerEngagedState,
                onDismissSurfaces = closeSurfaces,
                onCommit = viewModel::onSwipe,
                onCommitFeedback = haptics::light,
            ),
    ) {
        StoryGroupCubeNeighbors(cardMotion, previous = viewModel.groupAt(state.groupIndex - 1), next = viewModel.groupAt(state.groupIndex + 1))
        Box(
            modifier = Modifier
                .fillMaxSize()
                .storyCardFrame(cardMotion)
                .onGloballyPositioned { rail.boxOriginInRoot = it.positionInRoot() },
        ) {
            if (slide != null) {
                StorySlideChangeAnnouncement(slide.id, state.index, state.slides.size)
                val spoken = chrome.transcript.text(currentItem?.storyEffects, viewModel.transcriptLanguageChain())
                val canvasActions = remember(cardMotion, actions, haptics, viewModel) {
                    StoryCanvasA11yActions(
                        onNext = { haptics.light(); viewModel.advance() },
                        onPrevious = { haptics.light(); viewModel.back() },
                        onTogglePause = viewModel::onCanvasDoubleTap,
                        onToggleFullscreen = cardMotion.fullscreen::toggle,
                        onClose = actions.onClose,
                    )
                }
                Box(
                    Modifier.fillMaxSize().storyCanvasAccessibility(
                        slide = slide, index = state.index, count = state.slides.size, authorName = state.authorName,
                        transcript = spoken, paused = state.isPaused, fullscreen = cardMotion.fullscreen.enabled,
                        actions = canvasActions,
                    ),
                ) {
                StoryViewerReaderScene(
                    slide = slide,
                    item = currentItem,
                    progress = progress,
                    slideDurationMs = slideDurationMs,
                    playing = playing,
                    lap = lap,
                    state = state,
                    commentsOpen = chrome.showComments,
                    chromeVisible = chromeVisible,
                    fullscreen = cardMotion.fullscreen.enabled,
                    viewModel = viewModel,
                    captionExpanded = chrome.captionExpanded,
                )
                }
                StoryReadingScrims(chromeVisible = chromeShown)
            }

            StoryStallIndicator(waiting = waiting, modifier = Modifier.align(Alignment.Center))

            val composerPinned = commentThread != null && railPlan.pinsCommentComposer && slide != null &&
                !state.isDismissed && (!state.isPaused || composing)
            StoryCommentsOverlayHost(
                slide = slide,
                commentThread = commentThread,
                composerPinned = composerPinned,
                onComposerHeight = { composerHeightPx = it },
                comments = StoryCommentsOverlayRequest(
                    open = chrome.showComments,
                    storyId = state.currentStoryId,
                    isStoryExpired = currentItem?.isExpired(System.currentTimeMillis()) == true,
                    targetCommentId = chrome.targetCommentId,
                    targetParentCommentId = chrome.targetParentCommentId,
                    topReservedPx = headerHeightPx,
                    onListTop = { dragFrames.scrollableSurfaceTop = it },
                ),
                currentItem = currentItem,
                chrome = chrome,
                haptics = haptics,
                viewModel = viewModel,
                chromeVisible = chromeVisible,
                decorationsShown = StoryComposingFocus.showsContentDecorations(isComposing = isComposingFocus),
            )

            if (chromeAlpha > 0f && chromeVisible) {
                Box(Modifier.graphicsLayer { alpha = chromeAlpha }) {
                StoryViewerTopBar(
                    state = state,
                    slide = slide,
                    accent = accent,
                    progress = { scrubber.fraction() },
                    scrubber = scrubber,
                    awaitingStart = awaitingStart,
                    chrome = chrome,
                    videoExport = videoExport,
                    actions = actions,
                    haptics = haptics,
                    viewModel = viewModel,
                    onHeight = { headerHeightPx = it },
                )
                }
            }

            val railFrame = StoryRailFrame.of(headerHeightPx, composerHeightPx, composerPinned, with(density) { MeeshySpacing.sm.roundToPx() })
            StoryDragFrameSync(dragFrames, railShown = chromeVisible, composerHeightPx = if (composerPinned) composerHeightPx else 0, hasScrollableSurface = chrome.showComments)
            if (slide != null && !state.isDismissed && chromeAlpha > 0f && chromeVisible && (!keyboardVisible || isComposingFocus)) {
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
                        .graphicsLayer { alpha = chromeAlpha }
                        .trackStoryRailRegion(dragFrames)
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
            StoryGroupIntroLayer(groupIntro)
        }
    }
}
