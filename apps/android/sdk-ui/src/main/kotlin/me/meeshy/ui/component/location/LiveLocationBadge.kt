package me.meeshy.ui.component.location

import androidx.annotation.StringRes
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.LiveLocationCountdown
import me.meeshy.sdk.model.LiveLocationDuration
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

/**
 * "Someone is sharing their live position" capsule — Android render of the iOS
 * `LiveLocationBadge` (`LiveLocationBadge.swift`): a pulsing green dot, an accent
 * location glyph, the sharer's name, a live countdown, and an optional Stop action.
 *
 * All countdown maths live in the pure [LiveLocationCountdown]; this composable only
 * re-reads the clock each second (breaking the loop once the deadline passes) and
 * renders nothing once the share has expired — the same self-terminating tick as
 * `EphemeralCountdownBadge`. The localised "… remaining" wording comes from a string
 * resource (EN/FR/ES/PT), surpassing iOS's hard-coded French label.
 */
@Composable
public fun LiveLocationBadge(
    username: String,
    expiresAtMillis: Long,
    modifier: Modifier = Modifier,
    accentColor: String? = null,
    onStop: (() -> Unit)? = null,
) {
    val remaining by produceState(
        initialValue = (expiresAtMillis - System.currentTimeMillis()).coerceAtLeast(0L),
        expiresAtMillis,
    ) {
        while (true) {
            val r = (expiresAtMillis - System.currentTimeMillis()).coerceAtLeast(0L)
            value = r
            if (r <= 0L) break
            delay(1_000)
        }
    }
    if (remaining <= 0L) return

    val clockLabel = LiveLocationCountdown.of(remaining).clockLabel
    val title = stringResource(R.string.live_location_sharing_by, username)
    val remainingText = stringResource(R.string.live_location_remaining, clockLabel)
    val accent = resolveAccent(accentColor)

    val pulse = rememberInfiniteTransition(label = "live-location-pulse")
    val dotScale by pulse.animateFloat(
        initialValue = 1f,
        targetValue = 1.3f,
        animationSpec = infiniteRepeatable(tween(durationMillis = 1_000), RepeatMode.Reverse),
        label = "live-location-dot",
    )

    Row(
        modifier = modifier
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.85f))
            .border(0.5.dp, accent.copy(alpha = 0.2f), RoundedCornerShape(MeeshyRadius.md))
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm)
            .clearAndSetSemantics { contentDescription = "$title, $remainingText" },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        androidx.compose.foundation.layout.Box(
            modifier = Modifier
                .size(8.dp)
                .graphicsLayer { scaleX = dotScale; scaleY = dotScale }
                .clip(RoundedCornerShape(MeeshyRadius.pill))
                .background(MeeshyPalette.Success),
        )

        Icon(
            imageVector = Icons.Filled.LocationOn,
            contentDescription = null,
            tint = accent,
            modifier = Modifier.size(14.dp),
        )

        Column(
            modifier = Modifier.weight(1f, fill = false),
            verticalArrangement = Arrangement.spacedBy(1.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
            )
            Text(
                text = remainingText,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        if (onStop != null) {
            Text(
                text = stringResource(R.string.live_location_stop),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = MeeshyPalette.Error,
                modifier = Modifier
                    .clip(RoundedCornerShape(MeeshyRadius.pill))
                    .background(MeeshyPalette.Error.copy(alpha = 0.12f))
                    .clickable(onClick = onStop)
                    .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
            )
        }
    }
}

/**
 * Capsule chips to pick a [LiveLocationDuration] before starting a share — Android
 * render of the iOS `LiveLocationDurationPicker`. Stateless: the caller owns the
 * [selected] value and receives taps via [onSelect].
 */
@Composable
public fun LiveLocationDurationPicker(
    selected: LiveLocationDuration,
    onSelect: (LiveLocationDuration) -> Unit,
    modifier: Modifier = Modifier,
    accentColor: String? = null,
) {
    val accent = resolveAccent(accentColor)

    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Icon(
                imageVector = Icons.Filled.Timer,
                contentDescription = null,
                tint = accent,
                modifier = Modifier.size(14.dp),
            )
            Text(
                text = stringResource(R.string.live_location_duration_title),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }

        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            LiveLocationDuration.entries.forEach { duration ->
                val isSelected = duration == selected
                Text(
                    text = stringResource(durationLabelRes(duration)),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                    color = if (isSelected) MaterialTheme.colorScheme.onPrimary else accent,
                    modifier = Modifier
                        .clip(RoundedCornerShape(MeeshyRadius.pill))
                        .background(if (isSelected) accent else accent.copy(alpha = 0.12f))
                        .clickable { onSelect(duration) }
                        .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
                )
            }
        }
    }
}

@Composable
private fun resolveAccent(accentColor: String?): Color {
    val parsed = accentColor?.let(::hexColor)
    return if (parsed == null || parsed == Color.Unspecified) MaterialTheme.colorScheme.primary else parsed
}

@StringRes
private fun durationLabelRes(duration: LiveLocationDuration): Int = when (duration) {
    LiveLocationDuration.FIFTEEN_MINUTES -> R.string.live_location_duration_15m
    LiveLocationDuration.THIRTY_MINUTES -> R.string.live_location_duration_30m
    LiveLocationDuration.ONE_HOUR -> R.string.live_location_duration_1h
    LiveLocationDuration.TWO_HOURS -> R.string.live_location_duration_2h
    LiveLocationDuration.EIGHT_HOURS -> R.string.live_location_duration_8h
}
