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
import androidx.compose.foundation.gestures.detectDragGestures
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
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import coil.imageLoader
import coil.request.ImageRequest
import kotlin.math.roundToInt
import kotlinx.coroutines.delay
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.StorySlideDuration
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.ui.component.EmojiFullPicker
import me.meeshy.ui.component.EmojiQuickStrip
import me.meeshy.ui.component.LanguageQuickOption
import me.meeshy.ui.component.LanguageQuickStrip
import me.meeshy.ui.component.audio.AudioTrackSurface
import me.meeshy.ui.component.media.rememberThumbHashPainter
import me.meeshy.ui.component.video.ReelVideoSurface
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

private val SWIPE_HORIZONTAL_THRESHOLD = 64.dp
private val SWIPE_VERTICAL_THRESHOLD = 120.dp

/** Foreground media renders at this fraction of the canvas width, scaled by the object's own [StoryForegroundMediaView.scale]. */
private const val FOREGROUND_WIDTH_FRACTION = 0.45f

/** Wire `StoryTextObject.fontSize` is authored in this 1080-referential design space (iOS parity); the on-screen size scales it by the canvas width. */
private const val TEXT_DESIGN_CANVAS_WIDTH = 1080f

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
    viewModel: StoryViewerViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val slide = state.current
    // Per-slide auto-advance timing (author-pinned → content-derived → 6s), resolved
    // by the shared StorySlideDuration rule at projection time. Drives both the
    // countdown tween and the keyframe playhead so animations stay aligned.
    val slideDurationMs = slide?.autoAdvanceMillis ?: StorySlideDuration.DEFAULT_STATIC_MS
    val accent = remember(slide?.accentHex) { slide?.accentHex ?: "1A1A2E" }

    var showViewers by remember { mutableStateOf(false) }
    var showComments by remember { mutableStateOf(false) }
    var showSendTo by remember { mutableStateOf(false) }
    var sendToStoryId by remember { mutableStateOf<String?>(null) }
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
    val railOverlayActive = reactionBarVisible || languageBarVisible || scrubKind != null

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

    androidx.compose.runtime.LaunchedEffect(
        state.groupIndex,
        state.index,
        state.slides.size,
        state.canAutoAdvance,
        slideDurationMs,
        showViewers,
        showComments,
        showSendTo,
        railOverlayActive,
    ) {
        if (state.slides.isEmpty() || state.isDismissed || showViewers || showComments || showSendTo || railOverlayActive) return@LaunchedEffect
        viewModel.markCurrentViewed()
        progress.snapTo(0f)
        // Gate: hold the countdown at empty until the current slide's media has
        // painted (text-only slides are ready at once). When the gate flips the
        // effect re-runs and the timer starts.
        if (!state.canAutoAdvance) return@LaunchedEffect
        progress.animateTo(1f, tween(durationMillis = slideDurationMs, easing = LinearEasing))
        viewModel.advance()
    }

    val overlayActiveState = rememberUpdatedState(railOverlayActive)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(hexColor(accent))
            .onGloballyPositioned { boxOriginInRoot = it.positionInRoot() }
            .pointerInput(state.groupIndex, state.index, state.slides.size) {
                detectTapGestures { offset ->
                    if (overlayActiveState.value) {
                        closeRailBars()
                        return@detectTapGestures
                    }
                    if (offset.x < size.width / 2f) {
                        viewModel.back()
                    } else {
                        viewModel.advance()
                    }
                }
            }
            .pointerInput(state.groupIndex, state.index, state.slides.size) {
                val horizontalThreshold = SWIPE_HORIZONTAL_THRESHOLD.toPx()
                val verticalThreshold = SWIPE_VERTICAL_THRESHOLD.toPx()
                var dragX = 0f
                var dragY = 0f
                detectDragGestures(
                    onDragStart = { dragX = 0f; dragY = 0f },
                    onDragEnd = {
                        if (overlayActiveState.value) return@detectDragGestures
                        viewModel.onSwipe(
                            StorySwipeResolver.resolve(
                                dragX = dragX,
                                dragY = dragY,
                                horizontalThreshold = horizontalThreshold,
                                verticalThreshold = verticalThreshold,
                            ),
                        )
                    },
                    onDrag = { change, drag ->
                        change.consume()
                        dragX += drag.x
                        dragY += drag.y
                    },
                )
            },
    ) {
        when {
            slide?.backgroundVideoUrl != null -> {
                val bg = slide.backgroundTransform
                ReelVideoSurface(
                    mediaUrl = slide.backgroundVideoUrl,
                    isActive = true,
                    muted = false,
                    // Aspect-fill base, then the author's pan/zoom framing on top — the
                    // offset fractions scale to the measured canvas so it is resolution-
                    // independent (mirrors the image branch and iOS's "zoom inside the
                    // background", clipped by the 9:16 frame).
                    modifier = Modifier
                        .fillMaxSize()
                        .graphicsLayer {
                            // Deux axes depuis #5085 : un recadrage non carré
                            // agrandit différemment en largeur et en hauteur.
                            scaleX = bg.scaleX
                            scaleY = bg.scaleY
                            rotationZ = bg.rotationDegrees
                            translationX = bg.offsetXFraction * size.width
                            translationY = bg.offsetYFraction * size.height
                        },
                )
            }
            slide?.imageUrl != null -> {
                val imageUrl = slide.imageUrl
                val bg = slide.backgroundTransform
                AsyncImage(
                    model = imageUrl,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    // Instant blur behind the loading image — no black flash on cold
                    // load (decoded from the slide's ThumbHash; null → plain background).
                    placeholder = rememberThumbHashPainter(slide.backgroundThumbHash),
                    // Resolved (loaded or failed) → the countdown gate may open.
                    onSuccess = { viewModel.onImageResolved(imageUrl) },
                    onError = { viewModel.onImageResolved(imageUrl) },
                    // Aspect-fill base, then the author's pan/zoom framing on top — the
                    // offset fractions scale to the measured canvas so it is resolution-
                    // independent (mirrors iOS's "zoom inside the background", clipped).
                    modifier = Modifier
                        .fillMaxSize()
                        .graphicsLayer {
                            // Deux axes depuis #5085 : un recadrage non carré
                            // agrandit différemment en largeur et en hauteur.
                            scaleX = bg.scaleX
                            scaleY = bg.scaleY
                            rotationZ = bg.rotationDegrees
                            translationX = bg.offsetXFraction * size.width
                            translationY = bg.offsetYFraction * size.height
                        },
                )
            }
            slide != null -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(slideBackgroundBrush(slide.background, slide.accentHex)),
                )
            }
        }

        val playheadSeconds = progress.value * slideDurationMs / 1000f

        slide?.foregroundMedia?.forEach { foreground ->
            if (foreground.isVisible(playheadSeconds)) {
                key(foreground.url) {
                    StoryForegroundLayer(
                        media = foreground,
                        playheadSeconds = playheadSeconds,
                    )
                }
            }
        }

        slide?.textObjects?.forEach { textObject ->
            if (textObject.isVisible(playheadSeconds)) {
                key(textObject.id) {
                    StoryTextObjectLayer(
                        textObject = textObject,
                        playheadSeconds = playheadSeconds,
                    )
                }
            }
        }

        // The author's freehand drawing, read-only — a stroke-only slide is publishable
        // (StorySlideDeck.publishableSlides) but carries no other overlay, so without this
        // the reader (and the author, re-viewing their own story) would see a bare background.
        if (slide != null && slide.strokes.isNotEmpty()) {
            StoryDrawingLayer(
                strokes = slide.strokes,
                isCapturing = false,
                activeColorHex = "#FFFFFF",
                activeWidthDesign = 0.0,
                onStrokeCaptured = {},
                modifier = Modifier.fillMaxSize(),
            )
        }

        slide?.backgroundAudioUrl?.let { url ->
            key(url) { AudioTrackSurface(mediaUrl = url, isActive = true, loop = slide.backgroundLoop) }
        }
        slide?.foregroundAudioUrl?.let { url ->
            key(url) { AudioTrackSurface(mediaUrl = url, isActive = true, loop = false) }
        }

        if (slide != null && slide.text.isNotBlank()) {
            Text(
                text = slide.text,
                color = MeeshyPalette.White,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(MeeshySpacing.xl),
            )
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.sm),
        ) {
            SegmentedProgress(
                count = state.slides.size,
                index = state.index,
                currentProgress = progress.value,
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = MeeshySpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .padding(start = MeeshySpacing.xs),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = state.authorName,
                        color = MeeshyPalette.White,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    slide?.repostAttribution?.let { attribution ->
                        val handle = attribution.handle
                        val repostLabel = handle
                            ?.let { stringResource(R.string.stories_reposted_from, it) }
                            ?: stringResource(R.string.stories_reposted)
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .padding(start = MeeshySpacing.xs)
                                .semantics(mergeDescendants = true) {
                                    contentDescription = repostLabel
                                },
                        ) {
                            Icon(
                                Icons.Filled.Repeat,
                                contentDescription = null,
                                tint = MeeshyPalette.White.copy(alpha = 0.6f),
                                modifier = Modifier.size(12.dp),
                            )
                            handle?.let {
                                Text(
                                    text = "@$it",
                                    color = MeeshyPalette.White.copy(alpha = 0.65f),
                                    style = MaterialTheme.typography.labelMedium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.padding(start = 2.dp),
                                )
                            }
                        }
                    }
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
                                    sendToStoryId = state.currentStoryId
                                    showSendTo = true
                                },
                            )
                            if (state.isOwnStory) {
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

        val languageBadge = slide?.languageCode ?: state.languageOverride
        if (slide != null && !state.isDismissed) {
            StoryActionRail(
                plan = StoryRailPlan.resolve(
                    isOwnStory = state.isOwnStory,
                    hasTranslatableContent = state.availableLanguages.isNotEmpty(),
                ),
                reactionCount = state.reactionCount,
                hasReacted = state.myReactions.isNotEmpty(),
                languageBadgeCode = languageBadge,
                heartBouncePulse = heartBouncePulse,
                onTapHeart = { sendReaction("❤️", from = heartBounds) },
                onTapLanguage = {
                    reactionBarVisible = false
                    hoveredIndex = null
                    languageBarVisible = !languageBarVisible
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

    if (showFullEmojiPicker) {
        ModalBottomSheet(onDismissRequest = { showFullEmojiPicker = false }) {
            EmojiFullPicker(
                onSelect = { emoji ->
                    showFullEmojiPicker = false
                    sendReaction(emoji, from = null)
                },
            )
        }
    }

    val viewersStoryId = state.currentStoryId
    if (showViewers && viewersStoryId != null) {
        StoryViewersSheet(
            storyId = viewersStoryId,
            accentHex = accent,
            onDismiss = { showViewers = false },
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

    val frozenSendToStoryId = sendToStoryId
    if (showSendTo && frozenSendToStoryId != null) {
        StorySendToSheet(
            storyId = frozenSendToStoryId,
            accentHex = accent,
            onDismiss = {
                showSendTo = false
                sendToStoryId = null
            },
        )
    }
}

/**
 * The base-layer brush for a media-less slide. When the author pinned a
 * [StoryBackgroundValue] we paint it — a solid colour, or the two-colour linear
 * gradient (top-leading → bottom-trailing, iOS `storyBackgroundStyle` convention) —
 * falling back to the accent→black gradient when there is no background or a
 * degraded value cannot resolve to a real colour (so the slide is never blank).
 */
private fun slideBackgroundBrush(background: StoryBackgroundValue?, accentHex: String): Brush {
    val fallback = Brush.verticalGradient(listOf(hexColor(accentHex), Color.Black))
    return when (background) {
        null -> fallback
        is StoryBackgroundValue.Hex -> {
            val color = hexColor(background.hex)
            if (color == Color.Unspecified) fallback else SolidColor(color)
        }
        is StoryBackgroundValue.Gradient -> {
            val start = hexColor(background.start)
            val end = hexColor(background.end)
            if (start == Color.Unspecified || end == Color.Unspecified) {
                fallback
            } else {
                Brush.linearGradient(listOf(start, end))
            }
        }
    }
}

@Composable
private fun SegmentedProgress(count: Int, index: Int, currentProgress: Float) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        repeat(count) { i ->
            val fill = when {
                i < index -> 1f
                i == index -> currentProgress
                else -> 0f
            }
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(3.dp)
                    .clip(CircleShape)
                    .background(MeeshyPalette.White.copy(alpha = 0.3f)),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxHeight()
                        .fillMaxWidth(fill)
                        .clip(CircleShape)
                        .background(MeeshyPalette.White),
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

/**
 * A foreground video/image layer positioned at [StoryForegroundMediaView.x]/[y]
 * (canvas-normalised, 0..1) as its center anchor, sized to a fraction of the
 * canvas width scaled by the object's own `scale`. The [playheadSeconds] clock
 * drives keyframe animation via the pure [StoryForegroundMediaView.animated]:
 * position/scale/opacity follow the clip's keyframes for the current instant, or
 * hold their static base when the clip has none. Rotation and inter-slide
 * transitions are still not applied in this projection.
 */
@Composable
private fun StoryForegroundLayer(
    media: StoryForegroundMediaView,
    playheadSeconds: Float,
    modifier: Modifier = Modifier,
) {
    val animated = media.animated(playheadSeconds)
    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val aspectRatio = animated.aspectRatio.toFloat().takeIf { it > 0f } ?: 1f
        val targetWidth = maxWidth * FOREGROUND_WIDTH_FRACTION * animated.scale.toFloat().coerceIn(0.2f, 3f)
        val targetHeight = targetWidth / aspectRatio
        val offsetX = maxWidth * animated.x.toFloat() - targetWidth / 2
        val offsetY = maxHeight * animated.y.toFloat() - targetHeight / 2
        val layerModifier = Modifier
            .offset(x = offsetX, y = offsetY)
            .width(targetWidth)
            .aspectRatio(aspectRatio)
            .alpha(animated.opacity.toFloat().coerceIn(0f, 1f))
        if (media.isVideo) {
            ReelVideoSurface(mediaUrl = media.url, isActive = true, muted = false, modifier = layerModifier)
        } else {
            AsyncImage(
                model = media.url,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = layerModifier,
            )
        }
    }
}

/**
 * A text overlay positioned at [StoryTextObjectView.x]/[y] (canvas-normalised, 0..1)
 * as its center anchor. The [playheadSeconds] clock drives the pure
 * [StoryTextObjectView.animated]: position follows the object's keyframes and opacity
 * ramps through its fadeIn/fadeOut envelope for the current instant, or holds its
 * static base when the object authored neither. The Prisme-resolved [text] renders in
 * the authored [colorHex]/[align]; wire `fontSize` is a 1080-referential design unit
 * (× the object's `scale`) mapped onto the real canvas width, and [rotation] tilts the
 * glyphs about their own center — iOS `fontSize × scale` parity.
 */
@Composable
private fun StoryTextObjectLayer(
    textObject: StoryTextObjectView,
    playheadSeconds: Float,
    modifier: Modifier = Modifier,
) {
    val animated = textObject.animated(playheadSeconds)
    var textSize by remember { mutableStateOf(IntSize.Zero) }
    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val density = LocalDensity.current
        val centerXpx = with(density) { (maxWidth * animated.x.toFloat()).toPx() }
        val centerYpx = with(density) { (maxHeight * animated.y.toFloat()).toPx() }
        val canvasWidthPx = with(density) { maxWidth.toPx() }
        val color = animated.colorHex
            ?.let { runCatching { hexColor(it) }.getOrNull() }
            ?: MeeshyPalette.White
        val textAlign = when (animated.align) {
            "left" -> TextAlign.Start
            "right" -> TextAlign.End
            else -> TextAlign.Center
        }
        val fontSizePx = (animated.fontSize * animated.scale)
            .toFloat()
            .times(canvasWidthPx / TEXT_DESIGN_CANVAS_WIDTH)
            .coerceAtLeast(1f)
        Box(
            modifier = Modifier
                .align(Alignment.TopStart)
                .onSizeChanged { textSize = it }
                .offset {
                    IntOffset(
                        (centerXpx - textSize.width / 2f).roundToInt(),
                        (centerYpx - textSize.height / 2f).roundToInt(),
                    )
                }
                .graphicsLayer { rotationZ = animated.rotation.toFloat() }
                .alpha(animated.opacity.toFloat().coerceIn(0f, 1f))
                .storyTextBacking(animated.background)
                .padding(horizontal = 6.dp, vertical = 2.dp),
        ) {
            Text(
                text = animated.text,
                color = color,
                textAlign = textAlign,
                fontWeight = FontWeight.SemiBold,
                fontSize = with(density) { fontSizePx.toSp() },
                // The EFFECT axis (#4870) — the same table as the composer preview
                // and the two other clients, at the glyphs' real pixel size.
                style = LocalTextStyle.current.copy(shadow = animated.effect.composeShadow(fontSizePx, color)),
            )
        }
    }
}

/**
 * Paints an iOS/web-authored text backing behind the reader's glyphs (glue): a rounded
 * solid fill for [StoryTextBackground.Solid], a translucent frosted scrim approximating the
 * iOS glass blur for [StoryTextBackground.Glass], and nothing for [StoryTextBackground.None].
 * The *choice* of backing is the unit-tested [StoryTextBackground.resolve]; this only renders
 * it, mirroring the composer's own backing so author and reader agree on the look.
 */
private fun Modifier.storyTextBacking(background: StoryTextBackground): Modifier = when (background) {
    StoryTextBackground.None -> this
    is StoryTextBackground.Solid ->
        this.background(readerBackingColor(background.hex), RoundedCornerShape(10.dp))
    is StoryTextBackground.Glass ->
        this.background(Color.White.copy(alpha = 0.18f), RoundedCornerShape(10.dp))
}

/**
 * Parses a `RRGGBB` or `RRGGBBAA` backing hex (gateway parity, no `#`) into a [Color],
 * honouring the alpha byte so a translucent solid renders as authored. Decays to
 * [Color.Transparent] on anything unexpected so a malformed backing never crashes the canvas.
 */
private fun readerBackingColor(hex: String): Color = runCatching {
    val h = hex.removePrefix("#")
    val argb = when (h.length) {
        8 -> h.substring(6, 8) + h.substring(0, 6)
        6 -> "ff$h"
        else -> return Color.Transparent
    }
    Color(argb.toLong(16))
}.getOrDefault(Color.Transparent)
