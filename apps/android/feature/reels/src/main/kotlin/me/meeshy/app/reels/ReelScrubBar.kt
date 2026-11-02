package me.meeshy.app.reels

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.reels.R
import me.meeshy.sdk.model.ReelScrub
import me.meeshy.ui.component.video.ReelPlayerHandle
import me.meeshy.ui.haptics.rememberMeeshyHaptics

/**
 * La barre de lecture du réel affiché (iOS `ReelScrubBar`) : une piste fine, un pouce qui grossit
 * sous le doigt, un glissement HORIZONTAL qui cherche dans le média, un toucher qui y saute.
 *
 * **Aucune recomposition à la progression** : la position vit dans un état lu seulement en phase
 * de dessin, rafraîchi à chaque image tant que le réel joue — le pager, la page et ce composable
 * ne se recomposent pas. Le glissement vertical n'est jamais revendiqué (le pager le garde).
 */
@Composable
internal fun ReelScrubBar(
    player: ReelPlayerHandle?,
    accent: Color,
    modifier: Modifier = Modifier,
) {
    val haptics = rememberMeeshyHaptics()
    val progress = remember { mutableFloatStateOf(0f) }
    var seeking by remember { mutableStateOf(false) }
    var playing by remember(player) { mutableStateOf(player?.isPlaying == true) }

    DisposableEffect(player) {
        val stop = player?.observePlaying { playing = it }
        onDispose { stop?.invoke() }
    }

    LaunchedEffect(player, playing, seeking) {
        val handle = player ?: return@LaunchedEffect
        progress.floatValue = ReelScrub.progress(handle.positionMs(), handle.durationMs())
        while (playing && !seeking) {
            androidx.compose.runtime.withFrameNanos { }
            progress.floatValue = ReelScrub.progress(handle.positionMs(), handle.durationMs())
        }
    }

    val thumbScale = animateFloatAsState(
        targetValue = if (seeking) 1.25f else 1f,
        animationSpec = spring(dampingRatio = 0.7f, stiffness = 400f),
        label = "reel-scrub-thumb",
    )
    val density = LocalDensity.current
    val trackHeight = with(density) { 4.dp.toPx() }
    val thumbRadius = with(density) { 7.dp.toPx() }
    val label = stringResource(R.string.reels_scrub)

    Canvas(
        modifier
            .fillMaxWidth()
            .height(32.dp)
            .semantics {
                contentDescription = label
                progressBarRangeInfo = ProgressBarRangeInfo(progress.floatValue, 0f..1f)
            }
            .pointerInput(player) {
                detectTapGestures { offset ->
                    val handle = player ?: return@detectTapGestures
                    val target = ReelScrub.seekMs(ReelScrub.fraction(offset.x, size.width.toFloat()), handle.durationMs())
                        ?: return@detectTapGestures
                    handle.seekTo(target)
                    progress.floatValue = ReelScrub.progress(target, handle.durationMs())
                    haptics.light()
                }
            }
            .pointerInput(player) {
                detectHorizontalDragGestures(
                    onDragStart = { if (player != null && player.durationMs() > 0) seeking = true },
                    onDragEnd = {
                        if (seeking) {
                            player?.let { handle ->
                                ReelScrub.seekMs(progress.floatValue, handle.durationMs())?.let(handle::seekTo)
                            }
                            haptics.light()
                        }
                        seeking = false
                    },
                    onDragCancel = { seeking = false },
                ) { change, _ ->
                    if (!seeking) return@detectHorizontalDragGestures
                    change.consume()
                    progress.floatValue = ReelScrub.fraction(change.position.x, size.width.toFloat())
                }
            },
    ) {
        val centerY = size.height / 2f
        val corner = CornerRadius(trackHeight / 2f)
        drawRoundRect(
            color = Color.White.copy(alpha = 0.3f),
            topLeft = Offset(0f, centerY - trackHeight / 2f),
            size = Size(size.width, trackHeight),
            cornerRadius = corner,
        )
        val filled = size.width * progress.floatValue
        drawRoundRect(
            color = accent,
            topLeft = Offset(0f, centerY - trackHeight / 2f),
            size = Size(filled.coerceAtLeast(0f), trackHeight),
            cornerRadius = corner,
        )
        drawCircle(
            color = Color.Black.copy(alpha = 0.3f),
            radius = thumbRadius * thumbScale.value,
            center = Offset(filled.coerceIn(thumbRadius, size.width - thumbRadius), centerY + 1f),
        )
        drawCircle(
            color = Color.White,
            radius = thumbRadius * thumbScale.value,
            center = Offset(filled.coerceIn(thumbRadius, size.width - thumbRadius), centerY),
        )
    }
}
