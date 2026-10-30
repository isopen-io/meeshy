package me.meeshy.app.stories

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.automirrored.outlined.Comment
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.currentStateAsState
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import coil.imageLoader
import coil.request.ImageRequest
import kotlin.math.roundToInt
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.EmojiCatalog
import me.meeshy.sdk.model.StorySlideDuration
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.model.share.ShareCards
import me.meeshy.sdk.model.share.ShareSubject
import me.meeshy.sdk.model.story.StoryReplyRules
import me.meeshy.ui.share.LocalShareLauncher
import me.meeshy.ui.share.open
import me.meeshy.sdk.model.scene.StoryTextBackground
import me.meeshy.ui.component.EmojiFullPicker
import me.meeshy.ui.story.canvas.SceneLookChain
import me.meeshy.ui.component.EmojiQuickStrip
import me.meeshy.ui.component.LanguageQuickOption
import me.meeshy.ui.component.LanguageQuickStrip
import me.meeshy.ui.component.audio.AudioTrackSurface
import me.meeshy.ui.component.media.rememberThumbHashPainter
import me.meeshy.ui.component.video.ReelVideoSurface
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor


/**
 * Minimal but real story viewer: segmented progress, tap-to-advance/dismiss,
 * timed auto-advance gated on the slide, Prisme-resolved text and the slide's
 * background media. Android port of the core `StoryViewerView` loop.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StoryViewerScreen(
    onClose: () -> Unit,
    onRepost: (String) -> Unit = {},
    onOpenProfile: (String) -> Unit = {},
    onEditStory: ((String) -> Unit)? = null,
    onStoryMissing: (String) -> Unit = { onClose() },
    viewModel: StoryViewerViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
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
    // Per-slide auto-advance timing (author-pinned → content-derived → 6s), resolved
    // by the shared StorySlideDuration rule at projection time. Drives both the
    // countdown tween and the keyframe playhead so animations stay aligned.
    val slideDurationMs = slide?.autoAdvanceMillis ?: StorySlideDuration.DEFAULT_STATIC_MS
    val accent = remember(slide?.accentHex) { slide?.accentHex ?: "1A1A2E" }

    var showViewers by remember { mutableStateOf(false) }
    var showComments by remember { mutableStateOf(false) }
    var showReply by remember { mutableStateOf(false) }
    var showSendTo by remember { mutableStateOf(false) }
    val shareLauncher = LocalShareLauncher.current
    val shareContext = androidx.compose.ui.platform.LocalContext.current
    var showOptions by remember { mutableStateOf(false) }
    var showReportDialog by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }

    val haptics = LocalHapticFeedback.current
    val density = LocalDensity.current
    var scrubKind by remember { mutableStateOf<StoryScrubKind?>(null) }
    var reactionBarVisible by remember { mutableStateOf(false) }
    var languageBarVisible by remember { mutableStateOf(false) }
    var hoveredIndex by remember { mutableStateOf<Int?>(null) }
    val reactionTileBounds = remember { mutableStateMapOf<Int, Rect>() }
    val languageTileBounds = remember { mutableStateMapOf<Int, Rect>() }
    var heartBounds by remember { mutableStateOf<Rect?>(null) }
    var languageButtonBounds by remember { mutableStateOf<Rect?>(null) }
    var showFullEmojiPicker by remember { mutableStateOf(false) }
    var reactionFlight by remember { mutableStateOf<ReactionFlight?>(null) }
    var flightSerial by remember { mutableIntStateOf(0) }
    var heartBouncePulse by remember { mutableIntStateOf(0) }
    var boxOriginInRoot by remember { mutableStateOf(Offset.Zero) }
    val scope = rememberCoroutineScope()
    val meeshyHaptics = rememberMeeshyHaptics()
    // Le doigt déplace la carte en phase de DESSIN (graphicsLayer) : aucune recomposition
    // pendant le geste ; seule la prise du doigt fige la lecture.
    val cardMotion = rememberStoryCardMotion()
    val railOverlayActive = reactionBarVisible || languageBarVisible || scrubKind != null
    val cover = StoryViewerCover(
        sheet = showViewers || showComments || showReply || showSendTo || state.languageExplorer != null,
        railBar = railOverlayActive,
        menu = showOptions,
        dialog = showReportDialog || showDeleteDialog,
    )

    fun closeRailBars() {
        reactionBarVisible = false
        languageBarVisible = false
        hoveredIndex = null
    }

    fun sendReaction(emoji: String, from: Rect?) {
        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
        viewModel.react(emoji)
        closeRailBars()
        val target = heartBounds
        if (from != null && target != null) {
            flightSerial++
            reactionFlight = ReactionFlight(emoji = emoji, from = from, serial = flightSerial)
        } else {
            heartBouncePulse++
        }
    }

    fun handleScrub(event: StoryScrubEvent) {
        when (event) {
            is StoryScrubEvent.Started -> {
                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                scrubKind = event.kind
                when (event.kind) {
                    StoryScrubKind.Reactions -> {
                        reactionBarVisible = true
                        languageBarVisible = false
                    }
                    StoryScrubKind.Languages -> {
                        languageBarVisible = true
                        reactionBarVisible = false
                    }
                }
                hoveredIndex = null
            }
            is StoryScrubEvent.Moved -> {
                val bounds = when (scrubKind) {
                    StoryScrubKind.Reactions -> reactionTileBounds
                    StoryScrubKind.Languages -> languageTileBounds
                    null -> return
                }
                val tolerance = with(density) { 16.dp.toPx() }
                val next = ScrubHitResolver.hoveredIndex(bounds, event.rootPosition, tolerance)
                if (next != hoveredIndex) {
                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                }
                hoveredIndex = next
            }
            StoryScrubEvent.Ended -> {
                val kind = scrubKind
                val hovered = hoveredIndex
                scrubKind = null
                hoveredIndex = null
                when (kind) {
                    StoryScrubKind.Reactions -> when (
                        val release = ScrubHitResolver.release(hovered, state.quickReactions)
                    ) {
                        is ScrubRelease.React ->
                            sendReaction(release.emoji, from = reactionTileBounds[hovered])
                        ScrubRelease.Expand -> {
                            closeRailBars()
                            showFullEmojiPicker = true
                        }
                        ScrubRelease.KeepOpen -> Unit
                    }
                    StoryScrubKind.Languages -> {
                        val options = state.availableLanguages
                        if (hovered != null && hovered in options.indices) {
                            haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                            viewModel.toggleLanguageOverride(options[hovered].code)
                            closeRailBars()
                        }
                    }
                    null -> Unit
                }
            }
            StoryScrubEvent.Cancelled -> {
                scrubKind = null
                closeRailBars()
            }
        }
    }

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text(stringResource(R.string.stories_delete_confirm_title)) },
            text = { Text(stringResource(R.string.stories_delete_confirm_message)) },
            confirmButton = {
                TextButton(onClick = {
                    showDeleteDialog = false
                    viewModel.deleteCurrentStory(onEmpty = onClose)
                }) { Text(stringResource(R.string.stories_action_delete), color = MeeshyPalette.Error) }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) {
                    Text(stringResource(R.string.stories_cancel))
                }
            },
        )
    }
    if (showReportDialog) {
        AlertDialog(
            onDismissRequest = { showReportDialog = false },
            title = { Text(stringResource(R.string.stories_report_title)) },
            text = {
                Column {
                    ReportReason.entries.forEach { reason ->
                        val label = when (reason) {
                            ReportReason.SPAM -> stringResource(R.string.stories_report_reason_spam)
                            ReportReason.HARASSMENT -> stringResource(R.string.stories_report_reason_harassment)
                            ReportReason.INAPPROPRIATE -> stringResource(R.string.stories_report_reason_inappropriate)
                            ReportReason.VIOLENCE -> stringResource(R.string.stories_report_reason_violence)
                            ReportReason.HATE_SPEECH -> stringResource(R.string.stories_report_reason_hate_speech)
                            ReportReason.IMPERSONATION -> stringResource(R.string.stories_report_reason_impersonation)
                            ReportReason.OTHER -> stringResource(R.string.stories_report_reason_other)
                        }
                        Text(
                            text = label,
                            style = MaterialTheme.typography.bodyLarge,
                            color = MeeshyPalette.White,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    viewModel.reportCurrentStory(reason)
                                    showReportDialog = false
                                }
                                .padding(vertical = MeeshySpacing.md),
                        )
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { showReportDialog = false }) {
                    Text(stringResource(R.string.stories_cancel))
                }
            },
        )
    }

    val progress = remember { Animatable(0f) }

    val context = LocalContext.current
    androidx.compose.runtime.LaunchedEffect(state.prefetchUrls) {
        val loader = context.imageLoader
        state.prefetchUrls.forEach { url ->
            loader.enqueue(ImageRequest.Builder(context).data(url).build())
        }
    }

    androidx.compose.runtime.LaunchedEffect(state.isDismissed) {
        if (state.isDismissed) onClose()
    }

    val lifecycleState by LocalLifecycleOwner.current.lifecycle.currentStateAsState()
    // Une story joue tant qu'elle n'est ni retenue (appui long) ni cachée : app en
    // arrière-plan, appel entrant, écran éteint figent l'horloge et le son (#11040).
    val playing = !state.isPaused && !cardMotion.dragging &&
        lifecycleState.isAtLeast(Lifecycle.State.RESUMED)
    var progressSlideKey by remember { mutableStateOf<String?>(null) }

    androidx.compose.runtime.LaunchedEffect(
        state.groupIndex,
        state.index,
        state.currentStoryId,
        state.canAutoAdvance,
        slideDurationMs,
        cover.freezesPlayback,
        playing,
    ) {
        if (state.slides.isEmpty() || state.isDismissed) return@LaunchedEffect
        val slideKey = "${state.groupIndex}:${state.index}:${state.currentStoryId}"
        if (progressSlideKey != slideKey) {
            // Une nouvelle story repart de zéro et compte UNE vue ; une pause, une
            // feuille ou un retour au premier plan reprennent là où l'horloge s'était figée.
            progressSlideKey = slideKey
            progress.snapTo(0f)
            viewModel.markCurrentViewed()
        }
        if (!playing || cover.freezesPlayback) return@LaunchedEffect
        // Gate: hold the countdown until the current slide's media has painted
        // (text-only slides are ready at once). When the gate flips the effect re-runs.
        if (!state.canAutoAdvance) return@LaunchedEffect
        val remainingMs = ((1f - progress.value) * slideDurationMs).roundToInt().coerceAtLeast(0)
        progress.animateTo(1f, tween(durationMillis = remainingMs, easing = LinearEasing))
        viewModel.advance()
    }

    val overlayActiveState = rememberUpdatedState(railOverlayActive)
    val hasNextGroupState = rememberUpdatedState(state.hasNextGroup)
    val hasPreviousGroupState = rememberUpdatedState(state.hasPreviousGroup)
    StoryCubeEntryOnAuthorChange(cardMotion, authorKey = state.authorUserId, groupIndex = state.groupIndex)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .pointerInput(state.groupIndex, state.index, state.slides.size) {
                // Appui long ≥ 200 ms = pause qui tient au relâchement ; le tap suivant
                // reprend sans naviguer (iOS `StoryGestureOverlayView`).
                detectStoryCanvasTaps(
                    isDoubleTapZone = { StoryTapZone.of(it.x, size.width.toFloat()) == StoryTapZone.Center },
                    onDoubleTap = { if (!overlayActiveState.value) viewModel.onCanvasDoubleTap() },
                    onHold = { if (!overlayActiveState.value) viewModel.toggleByHold() },
                ) { offset ->
                    if (overlayActiveState.value) {
                        closeRailBars()
                    } else {
                        viewModel.onCanvasTap(StoryTapZone.of(offset.x, size.width.toFloat()))
                    }
                }
            }
            .storyCardDrag(
                motion = cardMotion,
                scope = scope,
                hasNextGroup = hasNextGroupState,
                hasPreviousGroup = hasPreviousGroupState,
                overlayActive = overlayActiveState,
                onOverlayDismiss = ::closeRailBars,
                onCommit = viewModel::onSwipe,
                onCommitFeedback = meeshyHaptics::light,
            ),
    ) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .storyCardFrame(cardMotion)
            .background(hexColor(accent))
            .onGloballyPositioned { boxOriginInRoot = it.positionInRoot() },
    ) {
        if (slide != null) {
            StorySceneBackground(
                slide = slide,
                playing = playing,
                muted = state.isMuted,
                // Un vocal ou un appel prend le son : la story se fige avec la vidéo (minuterie comprise), comme un appui long.
                onAudioFocusLost = viewModel::pauseByHold,
                onImageResolved = viewModel::onImageResolved,
            )
        }

        if (slide != null) {
            StorySceneOverlays(
                slide = slide,
                progress = progress,
                slideDurationMs = slideDurationMs,
                playing = playing,
                muted = state.isMuted,
                onAudioFocusLost = viewModel::pauseByHold,
            )
        }

        if (slide != null) StorySceneAudio(slide = slide, playing = playing, muted = state.isMuted)

        if (slide != null && slide.text.isNotBlank()) {
            StoryCaptionOverlay(
                text = slide.text,
                storyId = slide.id,
                modifier = Modifier.align(Alignment.BottomStart),
            )
        }

        if (!state.isPaused) Column(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.sm),
        ) {
            SegmentedProgress(
                count = state.slides.size,
                index = state.index,
                currentProgress = { progress.value },
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = MeeshySpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                StoryAuthorIdentity(
                    onClick = state.authorUserId?.let { userId ->
                        {
                            meeshyHaptics.light()
                            onOpenProfile(userId)
                        }
                    },
                    name = state.authorName,
                    avatarUrl = state.authorAvatarUrl,
                    accentHex = accent,
                    authorUserId = state.authorUserId,
                    authorPresence = state.authorPresence,
                    createdAtMillis = slide?.createdAtMillis,
                    repostAttribution = slide?.repostAttribution,
                    modifier = Modifier
                        .weight(1f)
                        .padding(start = MeeshySpacing.xs),
                )
                if (slide != null && slide.hasSound) {
                    StoryMuteButton(isMuted = state.isMuted, onToggle = viewModel::toggleMute)
                }
                if (slide?.isTranslated == true) {
                    TranslatedBadge()
                }
                if (state.isOwnStory && state.currentStoryId != null) {
                    Text(
                        text = stringResource(R.string.stories_viewers_title),
                        color = MeeshyPalette.White,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(Color.Black.copy(alpha = 0.4f))
                            .clickable { showViewers = true }
                            .padding(horizontal = MeeshySpacing.sm, vertical = 2.dp),
                    )
                }
                if (state.currentStoryId != null) {
                    IconButton(onClick = { showComments = true }) {
                        Icon(
                            Icons.AutoMirrored.Outlined.Comment,
                            contentDescription = stringResource(R.string.stories_comments_open),
                            tint = MeeshyPalette.White,
                        )
                    }
                }
                if (state.currentStoryId != null) {
                    Box {
                        IconButton(onClick = { showOptions = true }) {
                            Icon(
                                Icons.Filled.MoreVert,
                                contentDescription = stringResource(R.string.stories_options),
                                tint = MeeshyPalette.White,
                            )
                        }
                        DropdownMenu(expanded = showOptions, onDismissRequest = { showOptions = false }) {
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.stories_action_send_to)) },
                                onClick = {
                                    showOptions = false
                                    val storyId = state.currentStoryId
                                    if (storyId != null && shareLauncher != null) {
                                        showSendTo = true
                                        shareLauncher.open(
                                            ShareSubject.Card(
                                                ShareCards.story(
                                                    storyId = storyId,
                                                    authorId = null,
                                                    messageText = shareContext.getString(R.string.share_story_text, state.authorName, ShareCards.storyUrl(storyId)),
                                                ),
                                            ),
                                        ) { showSendTo = false }
                                    }
                                },
                            )
                            if (state.isOwnStory) {
                                if (onEditStory != null && StoryEditEntry.offered(state.isOwnStory, state.currentStoryId)) {
                                    DropdownMenuItem(
                                        text = { Text(stringResource(R.string.my_stories_edit)) },
                                        leadingIcon = { Icon(MeeshyIcons.Edit, contentDescription = null) },
                                        onClick = {
                                            showOptions = false
                                            state.currentStoryId?.let(onEditStory)
                                        },
                                    )
                                }
                                DropdownMenuItem(
                                    text = { Text(stringResource(R.string.stories_action_delete), color = MeeshyPalette.Error) },
                                    onClick = {
                                        showOptions = false
                                        showDeleteDialog = true
                                    },
                                )
                            } else {
                                state.currentStoryId?.let { storyId ->
                                    DropdownMenuItem(
                                        text = { Text(stringResource(R.string.stories_action_repost)) },
                                        onClick = {
                                            showOptions = false
                                            onRepost(storyId)
                                        },
                                    )
                                }
                                DropdownMenuItem(
                                    text = { Text(stringResource(R.string.stories_action_report)) },
                                    onClick = {
                                        showOptions = false
                                        showReportDialog = true
                                    },
                                )
                            }
                        }
                    }
                }
                IconButton(onClick = onClose) {
                    Icon(
                        Icons.Filled.Close,
                        contentDescription = stringResource(R.string.stories_viewer_close),
                        tint = MeeshyPalette.White,
                    )
                }
            }
        }

        val languageBadge = state.activeLanguageCode
        if (slide != null && !state.isDismissed && !state.isPaused) {
            StoryActionRail(
                plan = StoryRailPlan.resolve(
                    isOwnStory = state.isOwnStory,
                    hasTranslatableContent = state.availableLanguages.isNotEmpty(),
                    canReply = StoryReplyRules.canReply(state.isOwnStory, state.currentStoryId, state.authorUserId),
                ),
                reactionCount = state.reactionCount,
                hasReacted = state.myReactions.isNotEmpty(),
                languageBadgeCode = languageBadge,
                heartBouncePulse = heartBouncePulse,
                onTapHeart = { sendReaction(EmojiCatalog.DOUBLE_TAP_EMOJI, from = heartBounds) },
                onTapLanguage = {
                    reactionBarVisible = false
                    hoveredIndex = null
                    languageBarVisible = !languageBarVisible
                },
                onTapReply = {
                    closeRailBars()
                    meeshyHaptics.light()
                    showReply = true
                },
                onScrubEvent = ::handleScrub,
                onHeartBounds = { heartBounds = it },
                onLanguageBounds = { languageButtonBounds = it },
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .padding(end = MeeshySpacing.sm),
            )
        }

        RailAnchoredBar(
            visible = reactionBarVisible || scrubKind == StoryScrubKind.Reactions,
            anchor = heartBounds?.translate(-boxOriginInRoot),
        ) {
            EmojiQuickStrip(
                emojis = state.quickReactions,
                onReact = { emoji ->
                    sendReaction(
                        emoji,
                        from = reactionTileBounds[state.quickReactions.indexOf(emoji)],
                    )
                },
                ownReactions = state.myReactions,
                onExpand = {
                    closeRailBars()
                    showFullEmojiPicker = true
                },
                highlightedIndex = if (scrubKind == StoryScrubKind.Reactions) hoveredIndex else null,
                onTileBounds = { index, rect -> reactionTileBounds[index] = rect },
            )
        }

        RailAnchoredBar(
            visible = languageBarVisible || scrubKind == StoryScrubKind.Languages,
            anchor = languageButtonBounds?.translate(-boxOriginInRoot),
        ) {
            LanguageQuickStrip(
                options = state.availableLanguages.map {
                    LanguageQuickOption(
                        code = it.code,
                        flag = it.flag,
                        label = it.label,
                        isTranslatable = it.isTranslatable,
                        isTranslating = it.isTranslating,
                    )
                },
                onSelect = { option ->
                    if (option.isTranslatable) {
                        viewModel.requestStoryTranslation(option.code)
                    } else {
                        viewModel.toggleLanguageOverride(option.code)
                        closeRailBars()
                    }
                },
                activeCode = languageBadge,
                highlightedIndex = if (scrubKind == StoryScrubKind.Languages) hoveredIndex else null,
                onTileBounds = { index, rect -> languageTileBounds[index] = rect },
                onOpenAll = {
                    closeRailBars()
                    viewModel.openLanguageExplorer()
                },
            )
        }

        val flight = reactionFlight
        val flightTarget = heartBounds
        if (flight != null && flightTarget != null) {
            ReactionFlightOverlay(
                flight = flight.copy(from = flight.from.translate(-boxOriginInRoot)),
                target = flightTarget.translate(-boxOriginInRoot),
                onArrived = { heartBouncePulse++ },
                onFinished = { reactionFlight = null },
            )
        }

        if (state.slides.isEmpty() && !state.isLoading) {
            Text(
                text = stringResource(R.string.stories_empty),
                color = MeeshyPalette.White,
                modifier = Modifier.align(Alignment.Center),
            )
        }
    }
    }

    if (showFullEmojiPicker) {
        androidx.compose.ui.window.Dialog(
            onDismissRequest = { showFullEmojiPicker = false },
            properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .pointerInput(Unit) { detectTapGestures { showFullEmojiPicker = false } },
            ) {
                me.meeshy.ui.component.ReactionCategorySheet(
                    onReact = { emoji ->
                        showFullEmojiPicker = false
                        sendReaction(emoji, from = null)
                    },
                    onDismiss = { showFullEmojiPicker = false },
                    modifier = Modifier.align(Alignment.BottomCenter),
                )
            }
        }
    }

    state.languageExplorer?.let { explorer ->
        StoryLanguageSheet(
            explorer = explorer,
            onSelectLanguage = viewModel::selectLanguage,
            onTranslate = viewModel::requestStoryTranslation,
            onDismiss = viewModel::closeLanguageExplorer,
        )
    }

    val viewersStoryId = state.currentStoryId
    if (showViewers && viewersStoryId != null) {
        StoryViewersSheet(
            storyId = viewersStoryId,
            accentHex = accent,
            onDismiss = { showViewers = false },
        )
    }

    val replyStoryId = state.currentStoryId
    val replyAuthorId = state.authorUserId
    if (showReply && replyStoryId != null && replyAuthorId != null) {
        StoryReplySheet(
            quote = StoryReplyQuote(
                storyId = replyStoryId,
                authorId = replyAuthorId,
                authorName = state.authorName,
                preview = StoryReplyRules.quotePreview(slide?.text),
                thumbnailUrl = slide?.imageUrl,
                accentHex = accent,
            ),
            onDismiss = { showReply = false },
        )
    }

    val commentsStoryId = state.currentStoryId
    if (showComments && commentsStoryId != null) {
        StoryCommentsSheet(
            storyId = commentsStoryId,
            accentHex = accent,
            onDismiss = { showComments = false },
        )
    }
}

@Composable
private fun SegmentedProgress(count: Int, index: Int, currentProgress: () -> Float) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        repeat(count) { i ->
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(3.dp)
                    .clip(CircleShape)
                    .background(MeeshyPalette.White.copy(alpha = 0.3f)),
            ) {
                // Lue en phase de dessin : l'avancement de la barre ne recompose rien.
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .drawBehind {
                            val fill = when {
                                i < index -> 1f
                                i == index -> currentProgress().coerceIn(0f, 1f)
                                else -> 0f
                            }
                            if (fill <= 0f) return@drawBehind
                            val filled = size.width * fill
                            val left = if (layoutDirection == LayoutDirection.Rtl) size.width - filled else 0f
                            drawRoundRect(
                                color = MeeshyPalette.White,
                                topLeft = Offset(left, 0f),
                                size = Size(filled, size.height),
                                cornerRadius = CornerRadius(size.height / 2f),
                            )
                        },
                )
            }
        }
    }
}

@Composable
private fun TranslatedBadge() {
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.4f))
            .padding(horizontal = MeeshySpacing.sm, vertical = 2.dp),
    ) {
        Text(
            text = stringResource(R.string.stories_translated),
            color = MeeshyPalette.White,
            style = MaterialTheme.typography.labelSmall,
        )
    }
}

/**
 * A reaction emoji flying from its (scaled) bar tile to the heart button.
 * [serial] is a monotonic tie-breaker so reacting again with the same emoji
 * from the same tile within the flight window is still a distinct value
 * (structural equality would otherwise make the state write a no-op).
 */
private data class ReactionFlight(val emoji: String, val from: Rect, val serial: Int)

/**
 * Positions a scrubbable bar to the LEFT of its rail button, vertically
 * centred on it — the Android mirror of the iOS `.overlay(alignment:
 * .trailing) + .offset(x: -56)` anchoring. Enters/leaves with a fast
 * (~120 ms) fade+scale so a selected reaction clears the bar before the
 * flight animation starts (spec: bar must vanish quickly).
 */
@Composable
private fun BoxScope.RailAnchoredBar(
    visible: Boolean,
    anchor: Rect?,
    content: @Composable () -> Unit,
) {
    var barHeight by remember { mutableIntStateOf(0) }
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(120)) + scaleIn(initialScale = 0.8f, animationSpec = tween(120)),
        exit = fadeOut(tween(120)) + scaleOut(targetScale = 0.8f, animationSpec = tween(120)),
        modifier = Modifier
            .align(Alignment.TopEnd)
            .padding(end = 76.dp)
            .offset {
                val centerY = anchor?.center?.y ?: 0f
                IntOffset(x = 0, y = (centerY - barHeight / 2f).roundToInt().coerceAtLeast(0))
            }
            .onSizeChanged { barHeight = it.height },
    ) {
        content()
    }
}

/**
 * The chosen emoji flying from its scaled bar tile to the heart button:
 * position tween ~450 ms while shrinking 1.35 -> 0.5; on arrival the heart
 * bounces (bouncy spring, via [onArrived] -> heartBouncePulse) and the
 * overlay clears ~300 ms later. Total stays under the 1 s budget.
 */
@Composable
private fun ReactionFlightOverlay(
    flight: ReactionFlight,
    target: Rect,
    onArrived: () -> Unit,
    onFinished: () -> Unit,
) {
    val progress = remember(flight) { Animatable(0f) }
    LaunchedEffect(flight) {
        progress.animateTo(1f, tween(durationMillis = 450, easing = FastOutSlowInEasing))
        onArrived()
        delay(300)
        onFinished()
    }
    val from = flight.from.center
    val to = target.center
    val emojiSize = 36.dp
    Text(
        text = flight.emoji,
        fontSize = 22.sp,
        modifier = Modifier
            .offset {
                val t = progress.value
                val x = from.x + (to.x - from.x) * t
                val y = from.y + (to.y - from.y) * t
                val half = (emojiSize.toPx() / 2f)
                IntOffset((x - half).roundToInt(), (y - half).roundToInt())
            }
            .size(emojiSize)
            .graphicsLayer {
                val scale = 1.35f + (0.5f - 1.35f) * progress.value
                scaleX = scale
                scaleY = scale
            }
            .wrapContentSize(Alignment.Center),
    )
}

