package me.meeshy.app.stories

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import me.meeshy.sdk.model.StoryViewerInitialAction
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.sdk.model.StorySlideDuration
import me.meeshy.sdk.model.composer.StoryRepostAudience
import me.meeshy.sdk.model.story.StoryReplyRules
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.profile.LocalProfileSheetPresented
import me.meeshy.app.feed.LocalPostCardImager

/**
 * L'HÔTE du lecteur de stories : il choisit entre chargement, introuvable et lecture, puis assemble les fichiers
 * emplacement (`StoryViewerShell`, `StoryPlaybackDriver`, `StoryRailOverlays`, `StoryViewerSheetsHost`…). Il ne
 * porte aucune règle : un lot qui ajoute une fonction au lecteur étend SON fichier, pas celui-ci.
 */
@Composable
fun StoryViewerScreen(
    onClose: () -> Unit,
    onOpenProfile: (String) -> Unit = {},
    onEditStory: ((String) -> Unit)? = null,
    /** « Composer » (#13849, iOS `message.compose.title`) : une scène NEUVE semée de celle de la story, pour toute story. */
    onComposeStory: ((String) -> Unit)? = null,
    onStoryMissing: (String) -> Unit = { onClose() },
    viewModel: StoryViewerViewModel = hiltViewModel(),
) {
    val stateHolder = viewModel.state.collectAsStateWithLifecycle()
    val state = stateHolder.value
    state.missingStoryId?.let { missingId ->
        LaunchedEffect(missingId) { onStoryMissing(missingId) }
        StoryViewerLoading()
        return
    }
    if (state.loadFailed) {
        StoryViewerNotFound(onRetry = viewModel::retry, onClose = onClose)
        return
    }
    if (state.isLoading && state.slides.isEmpty()) {
        StoryViewerLoading()
        return
    }
    val slide = state.current
    // Per-slide auto-advance timing (author-pinned → content-derived → 6s), resolved by the shared
    // StorySlideDuration rule at projection time; it drives the countdown and the keyframe playhead.
    val slideDurationMs = slide?.autoAdvanceMillis ?: StorySlideDuration.DEFAULT_STATIC_MS
    val accent = remember(slide?.accentHex) { slide?.accentHex ?: "1A1A2E" }

    val chrome = rememberStoryViewerChromeState()
    LaunchedEffect(state.currentStoryId) {
        val intent = viewModel.consumeEntryIntent()
        chrome.targetCommentId = intent?.targetCommentId
        chrome.targetParentCommentId = intent?.targetParentCommentId
        if (intent?.targetCommentId != null) chrome.showComments = true
        when (intent?.action) {
            StoryViewerInitialAction.COMMENTS -> chrome.showComments = true
            StoryViewerInitialAction.VIEWS -> chrome.showViewers = true
            null -> Unit
        }
    }
    val density = LocalDensity.current
    val haptics = LocalHapticFeedback.current
    val meeshyHaptics = rememberMeeshyHaptics()
    val rail = remember(density) { StoryRailController(stateHolder, viewModel, haptics, density) }
    val cardMotion = rememberStoryCardMotion()
    val videoExport = rememberStoryVideoExport(
        item = { state.currentStoryId?.let(viewModel::rawItem) },
        slide = slide,
        author = { state.exportAuthor(accent) },
    )
    val commentThread = rememberStoryCommentThread(state.currentStoryId)
    val currentItem = state.currentStoryId?.let(viewModel::rawItem)
    val commentCount = rememberStoryCommentCount(commentThread, currentItem?.commentCount ?: 0)
    val soundShown = rememberStorySoundButtonShown(slide, currentItem?.storyEffects)
    val liveRailPlan = StoryRailPlan.resolve(
        isOwnStory = state.isOwnStory,
        hasTranslatableContent = state.availableLanguages.isNotEmpty(),
        canReply = StoryReplyRules.canReply(state.isOwnStory, state.currentStoryId, state.authorUserId),
        canCompose = onComposeStory != null && state.canCompose,
        commentCount = commentCount,
        isRepublishable = StoryRepostAudience.isRepublishable(currentItem?.visibility),
        hasAudibleSound = soundShown,
    )
    val railPlan = rememberFrozenRailPlan(
        StoryRailFreezeInput(state.currentStoryId, liveRailPlan, soundShown, rememberStoryCommentsReconciled(commentThread)),
    )
    val composerPanels = remember(state.currentStoryId) { StoryComposerPanels() }
    val composing = railPlan.pinsCommentComposer && storyCommentHolds(commentThread, composerPanels)
    val groupIntro = rememberStoryGroupIntro(state, slide?.opening, viewModel)
    val cover = StoryViewerCover(
        sheet = chrome.sheetOpen || state.languageExplorer != null,
        railBar = rail.overlayActive,
        menu = chrome.showOptions,
        dialog = chrome.dialogOpen || videoExport.busy,
        composing = composing,
        reading = chrome.captionExpanded || chrome.transcript.requested,
        groupIntro = groupIntro.shown,
        profile = LocalProfileSheetPresented.current.value,
    )
    val cardImager = LocalPostCardImager.current
    val imager: (() -> Unit)? = cardImager?.let { open -> { storyImagerRequest(currentItem, slide, state, videoExport)?.let(open) } }
    val actions = rememberStoryViewerActions(
        imager = imager,
        state = state,
        currentItem = currentItem,
        chrome = chrome,
        haptics = meeshyHaptics,
        fullscreen = cardMotion.fullscreen,
        viewModel = viewModel,
        onClose = onClose,
        onOpenProfile = onOpenProfile,
        onEditStory = onEditStory,
        onComposeStory = onComposeStory,
    )

    val playback = rememberStoryPlayback(state, slideDurationMs, cover, rail, cardMotion.dragging, viewModel)
    StoryViewerLifecycleEffects(state, viewModel.prefetch.collectAsStateWithLifecycle().value, onClose)

    CompositionLocalProvider(
        LocalStoryAudioGain provides { StoryViewerCardTransform.audioGain(cardMotion.dismissal.value) },
        LocalStoryComposerPanels provides composerPanels,
    ) {
    StoryViewerShell(
        state = state,
        slide = slide,
        accent = accent,
        slideDurationMs = slideDurationMs,
        progress = playback.progress,
        playing = playback.playing,
        lap = playback.lap,
        waiting = playback.waiting,
        awaitingStart = playback.awaitingStart,
        scrubber = playback.scrubber,
        composing = cover.composing,
        railPlan = railPlan,
        commentThread = commentThread,
        commentCount = commentCount,
        currentItem = currentItem,
        keyboardVisible = storyKeyboardVisible(),
        cardMotion = cardMotion,
        rail = rail,
        chrome = chrome,
        videoExport = videoExport,
        imager = imager,
        actions = actions,
        haptics = meeshyHaptics,
        viewModel = viewModel,
        groupIntro = groupIntro,
    )
    }
    StoryViewerSheetsHost(
        state = state,
        chrome = chrome,
        rail = rail,
        viewModel = viewModel,
        slide = slide,
        accent = accent,
        commentThread = commentThread,
        currentItem = currentItem,
        onClose = onClose,
    )
}
