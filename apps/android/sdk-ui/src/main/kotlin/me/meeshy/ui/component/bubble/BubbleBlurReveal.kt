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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.BlurRevealLifecycle
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyPalette

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
    // A view-once reveal must first consume the server counter (requiresConsume); until
    // that endpoint is wired the reveal proceeds locally, but the request already drives
    // the distinct "view once" affordance vs a plain "tap to reveal" blur.
    val request = remember(messageId, spec) {
        BlurRevealLifecycle.RevealRequest(messageId = messageId, isViewOnce = spec.isViewOnce)
    }

    // 0f = concealed (blur on), 1f = revealed (blur off).
    val reveal = remember(spec) { Animatable(0f) }
    // The transient fog spike that plays during the re-conceal (0 → 1 → 0).
    val fog = remember(spec) { Animatable(0f) }
    var revealToken by remember(spec) { mutableIntStateOf(0) }
    val isRevealing = revealToken > 0

    androidx.compose.runtime.LaunchedEffect(spec, revealToken) {
        if (revealToken == 0) return@LaunchedEffect
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

    Box(modifier.clip(shape)) {
        Box(
            modifier = if (concealed) {
                Modifier.blur(CONCEAL_BLUR_RADIUS, BlurredEdgeTreatment.Unbounded)
            } else {
                Modifier
            },
        ) {
            content()
        }
        if (scrimAlpha > 0.01f) {
            val revealActionLabel = stringResource(R.string.bubble_blur_reveal_action)
            Box(
                modifier = Modifier
                    .matchParentSize()
                    .background(FOG_COLOR.copy(alpha = scrimAlpha))
                    .let { base ->
                        if (isRevealing) base
                        else base
                            .semantics { contentDescription = revealActionLabel }
                            .clickable { revealToken += 1 }
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

private val CONCEAL_BLUR_RADIUS = 18.dp
private const val RESTING_CONCEAL_ALPHA = 0.94f
private val FOG_COLOR = Color(0xFF1E1B4B) // indigo950 — the fog reads as a Meeshy-brand veil
