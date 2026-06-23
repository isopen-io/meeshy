package me.meeshy.app.stories

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Comment
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import coil.imageLoader
import coil.request.ImageRequest
import me.meeshy.feature.stories.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

private const val SLIDE_DURATION_MS = 5000
private val SWIPE_HORIZONTAL_THRESHOLD = 64.dp
private val SWIPE_VERTICAL_THRESHOLD = 120.dp

/**
 * Minimal but real story viewer: segmented progress, tap-to-advance/dismiss,
 * timed auto-advance gated on the slide, Prisme-resolved text and the slide's
 * background media. Android port of the core `StoryViewerView` loop.
 */
@Composable
fun StoryViewerScreen(
    onClose: () -> Unit,
    viewModel: StoryViewerViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val slide = state.current
    val accent = remember(slide?.accentHex) { slide?.accentHex ?: "1A1A2E" }

    var showViewers by remember { mutableStateOf(false) }
    var showComments by remember { mutableStateOf(false) }

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
        showViewers,
        showComments,
    ) {
        if (state.slides.isEmpty() || state.isDismissed || showViewers || showComments) return@LaunchedEffect
        viewModel.markCurrentViewed()
        progress.snapTo(0f)
        // Gate: hold the countdown at empty until the current slide's media has
        // painted (text-only slides are ready at once). When the gate flips the
        // effect re-runs and the timer starts.
        if (!state.canAutoAdvance) return@LaunchedEffect
        progress.animateTo(1f, tween(durationMillis = SLIDE_DURATION_MS, easing = LinearEasing))
        viewModel.advance()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(hexColor(accent))
            .pointerInput(state.groupIndex, state.index, state.slides.size) {
                detectTapGestures { offset ->
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
        if (slide?.imageUrl != null) {
            val imageUrl = slide.imageUrl
            AsyncImage(
                model = imageUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                // Resolved (loaded or failed) → the countdown gate may open.
                onSuccess = { viewModel.onImageResolved(imageUrl) },
                onError = { viewModel.onImageResolved(imageUrl) },
                modifier = Modifier.fillMaxSize(),
            )
        } else if (slide != null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            listOf(hexColor(slide.accentHex), Color.Black),
                        ),
                    ),
            )
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
                Text(
                    text = state.authorName,
                    color = MeeshyPalette.White,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier
                        .weight(1f)
                        .padding(start = MeeshySpacing.xs),
                )
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
                IconButton(onClick = onClose) {
                    Icon(
                        Icons.Filled.Close,
                        contentDescription = stringResource(R.string.stories_viewer_close),
                        tint = MeeshyPalette.White,
                    )
                }
            }
        }

        if (slide != null && !state.isDismissed) {
            ReactionStrip(
                emojis = state.quickReactions,
                myReactions = state.myReactions,
                reactionCount = state.reactionCount,
                onReact = viewModel::react,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .navigationBarsPadding()
                    .padding(bottom = MeeshySpacing.lg, start = MeeshySpacing.md, end = MeeshySpacing.md),
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
}

/**
 * Quick-reaction strip pinned above the navigation bar. Each emoji fires an
 * optimistic [onReact]; already-sent emojis read as selected. Tapping an emoji
 * is consumed here so it never leaks to the tap-to-advance gesture behind it.
 */
@Composable
private fun ReactionStrip(
    emojis: List<String>,
    myReactions: Set<String>,
    reactionCount: Int,
    onReact: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.35f))
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (reactionCount > 0) {
            Text(
                text = reactionCount.toString(),
                style = MaterialTheme.typography.labelLarge,
                color = MeeshyPalette.White,
                modifier = Modifier.padding(end = MeeshySpacing.xs),
            )
        }
        emojis.forEach { emoji ->
            val selected = emoji in myReactions
            Box(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(
                        if (selected) MeeshyPalette.White.copy(alpha = 0.25f) else Color.Transparent,
                    )
                    .clickable { onReact(emoji) }
                    .padding(MeeshySpacing.xs),
            ) {
                Text(text = emoji, style = MaterialTheme.typography.titleLarge)
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
