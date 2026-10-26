package me.meeshy.ui.component.bubble

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.outlined.LocalFireDepartment
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.BlurRevealLifecycle
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Consumes the server-side view counter of a view-once message once its text has been
 * read and closed. The default is absent (inert): the host that owns the conversation
 * binds the endpoint. Closing is idempotent, so the consumer fires at most once per read.
 */
public fun interface ViewOnceConsumer {
    public fun consume(messageId: String)
}

public val LocalViewOnceConsumer: androidx.compose.runtime.ProvidableCompositionLocal<ViewOnceConsumer?> =
    staticCompositionLocalOf { null }

/**
 * Non-consuming tap on a revealed view-once text — port of iOS `ViewOnceRetouchModifier`
 * (`simultaneousGesture`): it never swallows the long press nor a tapped link, and an
 * inactive message gets no gesture at all.
 */
internal fun Modifier.viewOnceRetouch(isActive: Boolean, onRetouch: () -> Unit): Modifier =
    if (!isActive) this else composed {
        val latest = rememberUpdatedState(onRetouch)
        pointerInput(Unit) {
            awaitEachGesture {
                awaitFirstDown(requireUnconsumed = false)
                if (waitForUpOrCancellation() != null) latest.value()
            }
        }
    }

/**
 * Wraps a message bubble body in a "tap to reveal" fog + blur — Android render of the
 * iOS `BubbleBlurRevealController` / blurred-bubble treatment. The content is concealed
 * at rest behind a near-opaque scrim (so it stays hidden even below API 31, where
 * [blur] is a no-op) plus a real blur on API 31+. Tapping replays the pure
 * [BlurRevealLifecycle.revealTimeline] keyframes: reveal → fog-in → re-blur → fog-out,
 * leaving the bubble concealed again.
 *
 * All timing lives in the pure [BlurRevealLifecycle]; this composable is coverage-exempt
 * glue that only replays those keyframes off the clock.
 */
@Composable
internal fun BubbleBlurReveal(
    messageId: String,
    spec: BubbleBlurRevealSpec,
    modifier: Modifier = Modifier,
    shape: androidx.compose.ui.graphics.Shape = RoundedCornerShape(0.dp),
    content: @Composable () -> Unit,
) {
    // A view-once text is read in place until it is retouched or leaves the screen; it
    // then burns to "(1) · Already opened" and consumes the server counter through
    // LocalViewOnceConsumer (inert until the host binds the endpoint).
    val request = remember(messageId, spec) {
        BlurRevealLifecycle.RevealRequest(messageId = messageId, isViewOnce = spec.isViewOnce)
    }

    // 0f = concealed (blur on), 1f = revealed (blur off).
    val reveal = remember(spec) { Animatable(0f) }
    // The transient fog spike that plays during the re-conceal (0 → 1 → 0).
    val fog = remember(spec) { Animatable(0f) }
    var revealToken by remember(spec) { mutableIntStateOf(0) }
    var stage by remember(messageId) { mutableStateOf(BlurRevealLifecycle.ViewOnceStage.Sealed) }
    val consumer = LocalViewOnceConsumer.current
    val latestStage = rememberUpdatedState(stage)
    val latestConsumer = rememberUpdatedState(consumer)
    val isViewOnceText = request.requiresConsume
    val isRevealing = if (isViewOnceText) {
        stage == BlurRevealLifecycle.ViewOnceStage.Revealed
    } else {
        revealToken > 0
    }

    fun closeViewOnce() {
        val closure = BlurRevealLifecycle.close(stage)
        stage = closure.stage
        if (closure.consume) latestConsumer.value?.consume(messageId)
    }

    // Second door: the bubble leaves the screen (scroll-out, conversation exit, any skin).
    DisposableEffect(messageId, isViewOnceText) {
        onDispose {
            if (!isViewOnceText) return@onDispose
            val closure = BlurRevealLifecycle.close(latestStage.value)
            if (closure.consume) latestConsumer.value?.consume(messageId)
        }
    }

    androidx.compose.runtime.LaunchedEffect(stage) {
        if (!isViewOnceText) return@LaunchedEffect
        val revealed = stage == BlurRevealLifecycle.ViewOnceStage.Revealed
        reveal.animateTo(if (revealed) 1f else 0f, tween(REVEAL_MILLIS))
    }

    androidx.compose.runtime.LaunchedEffect(spec, revealToken) {
        if (isViewOnceText || revealToken == 0) return@LaunchedEffect
        var last = 0L
        BlurRevealLifecycle.revealTimeline(spec.visibilitySeconds).forEach { step ->
            kotlinx.coroutines.delay((step.atMillis - last).coerceAtLeast(0))
            last = step.atMillis
            val dur = step.animationDurationMillis.toInt().coerceAtLeast(1)
            launch { reveal.animateTo(if (step.isRevealed) 1f else 0f, tween(dur)) }
            fog.animateTo(step.fogOpacity.toFloat(), tween(dur))
        }
        revealToken = 0
    }

    // Scrim opacity: near-opaque at rest, clears as the content reveals, and follows
    // the transient fog spike during the re-conceal.
    val restingScrim = RESTING_CONCEAL_ALPHA * (1f - reveal.value)
    val scrimAlpha = maxOf(restingScrim, fog.value)
    val concealed = reveal.value < 0.5f

    val opened = isViewOnceText && stage == BlurRevealLifecycle.ViewOnceStage.Opened
    Box(modifier.clip(shape)) {
        if (opened) {
            OpenedChip()
            return@Box
        }
        Box(
            modifier = (
                if (concealed) {
                    // Le flou ne cache qu'à l'œil : tant que c'est masqué, le contenu sort
                    // aussi de l'arbre d'accessibilité, sinon TalkBack le lirait en clair.
                    Modifier
                        .blur(CONCEAL_BLUR_RADIUS, BlurredEdgeTreatment.Unbounded)
                        .clearAndSetSemantics {}
                } else {
                    Modifier
                }
                ).viewOnceRetouch(
                isActive = BlurRevealLifecycle.retouchGestureActive(isViewOnceText, stage),
                onRetouch = ::closeViewOnce,
            ),
        ) {
            content()
        }
        if (!opened && scrimAlpha > 0.01f) {
            val revealActionLabel = stringResource(R.string.bubble_blur_reveal_action)
            Box(
                modifier = Modifier
                    .matchParentSize()
                    .background(FOG_COLOR.copy(alpha = scrimAlpha))
                    .let { base ->
                        if (isRevealing) base
                        else base
                            .semantics { contentDescription = revealActionLabel }
                            .clickable {
                                if (isViewOnceText) stage = BlurRevealLifecycle.reveal(stage) else revealToken += 1
                            }
                    },
                contentAlignment = Alignment.Center,
            ) {
                if (concealed && !isRevealing) {
                    RevealHint(isViewOnce = request.requiresConsume)
                }
            }
        }
    }
}

@Composable
private fun OpenedChip() {
    Text(
        text = stringResource(R.string.bubble_view_once_opened),
        color = MeeshyPalette.White.copy(alpha = 0.7f),
        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
    )
}

@Composable
private fun RevealHint(isViewOnce: Boolean) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(MeeshyPalette.White.copy(alpha = 0.16f))
            .padding(horizontal = 12.dp, vertical = 6.dp),
    ) {
        Icon(
            imageVector = if (isViewOnce) {
                Icons.Outlined.LocalFireDepartment
            } else {
                Icons.Filled.Visibility
            },
            contentDescription = null,
            tint = MeeshyPalette.White,
            modifier = Modifier.size(15.dp),
        )
        Text(
            text = stringResource(
                if (isViewOnce) R.string.bubble_blur_view_once else R.string.bubble_blur_tap_to_reveal,
            ),
            color = MeeshyPalette.White,
        )
    }
}

private const val REVEAL_MILLIS = 300
private val CONCEAL_BLUR_RADIUS = 18.dp
private const val RESTING_CONCEAL_ALPHA = 0.94f
private val FOG_COLOR = Color(0xFF1E1B4B) // indigo950 — the fog reads as a Meeshy-brand veil
