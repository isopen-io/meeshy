package me.meeshy.ui.component.bubble

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.Instant
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.EphemeralLifecycle
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/**
 * "Flame + countdown" capsule shown under an ephemeral (self-destruct) message —
 * Android render of the iOS `BubbleEphemeralBadge`. All countdown maths live in the
 * pure [EphemeralLifecycle]; this composable only reads the clock and re-ticks the
 * derived state each second.
 *
 * Renders nothing when there is no expiry ([EphemeralLifecycle.State.None]) or once
 * the deadline has passed ([EphemeralLifecycle.State.Expired]) — a burned message is
 * handled by the deleted/burned bubble path, not by this badge.
 */
@Composable
internal fun EphemeralCountdownBadge(
    expiresAtIso: String?,
    modifier: Modifier = Modifier,
) {
    val expiresAt: Instant? = isoToEpochMillisOrNull(expiresAtIso)?.let(Instant::ofEpochMilli)
    if (expiresAt == null) return

    val state by produceState<EphemeralLifecycle.State>(
        initialValue = EphemeralLifecycle.evaluate(expiresAt, Instant.now()),
        expiresAt,
    ) {
        while (true) {
            val next = EphemeralLifecycle.evaluate(expiresAt, Instant.now())
            value = next
            if (next is EphemeralLifecycle.State.Expired) break
            delay(1_000)
        }
    }

    val running = state as? EphemeralLifecycle.State.Running ?: return
    val label = EphemeralLifecycle.format(running.remainingSeconds)
    val description = "Ephemeral message, expires in $label"

    Row(
        modifier = modifier
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(MeeshyPalette.Error.copy(alpha = 0.12f))
            .border(0.5.dp, MeeshyPalette.Error.copy(alpha = 0.3f), RoundedCornerShape(MeeshyRadius.pill))
            .padding(horizontal = MeeshySpacing.sm, vertical = 2.dp)
            .clearAndSetSemantics { contentDescription = description },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.LocalFireDepartment,
            contentDescription = null,
            tint = MeeshyPalette.Error,
            modifier = Modifier.size(12.dp),
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Bold,
            color = MeeshyPalette.Error,
        )
    }
}
