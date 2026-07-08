package me.meeshy.ui.component

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.PresenceState
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.NunitoFontFamily

/** Story-ring affordance (parity plan §4.3 — port of iOS `StoryRingState`). */
public enum class StoryRingState { None, Unread, Read }

/**
 * CENTRAL presence-dot colour mapping for [presence], or `null` when the caller
 * has no presence data at all. Pure so it stays unit-testable off Compose.
 * Mirrors iOS `PresenceState.dotColor` (PresenceStyle.swift) and web
 * `PRESENCE_DOT_CLASS`: green = online/recent, orange = away, gray = offline.
 * Every surface (contacts, profile, new-conversation) MUST consume this —
 * never redeclare the palette locally.
 */
public fun meeshyPresenceDotColor(presence: PresenceState?): Color? = when (presence) {
    PresenceState.ONLINE, PresenceState.RECENT -> MeeshyPalette.Success // vert : connecté / actif <= 5min
    PresenceState.AWAY -> MeeshyPalette.Warning                          // orange : absent 5-30min
    PresenceState.OFFLINE -> MeeshyPalette.Neutral400                    // gris : hors ligne > 30min
    null -> null                                                          // aucune donnée de présence
}

/**
 * Circular avatar (parity plan §4.3, port of iOS `MeeshyAvatar`). Gradient fill
 * (accent → [secondaryColor] or accent@60%) with rounded bold initials, plus the
 * optional signature affordances: a story ring, a presence dot, and a mood emoji
 * badge. Animations (ring rotation, mood pulse) are Phase 3 — this atom is static.
 *
 * SDK-pure: every behaviour is an explicit opaque parameter. The product decision
 * of *which* size/ring/presence a given surface uses (iOS `AvatarContext`) stays
 * app-side.
 */
@Composable
public fun MeeshyAvatar(
    name: String,
    modifier: Modifier = Modifier,
    size: Dp = 48.dp,
    containerColor: Color = MeeshyPalette.Indigo500,
    secondaryColor: Color? = null,
    contentColor: Color = MeeshyPalette.White,
    storyRing: StoryRingState = StoryRingState.None,
    presence: PresenceState? = null,
    moodEmoji: String? = null,
) {
    val density = LocalDensity.current
    val textSize = with(density) { (size * 0.38f).toSp() }
    val fallbackDescription = stringResource(R.string.avatar_fallback)

    val ringExtra = 6.dp
    val ringWidth = if (size <= 32.dp) 1.5.dp else 2.5.dp
    val hasRing = storyRing != StoryRingState.None
    val boxSize = if (hasRing) size + ringExtra else size
    val gradientEnd = secondaryColor ?: containerColor.copy(alpha = 0.6f)
    val dotColor = meeshyPresenceDotColor(presence)
    val dotBorderColor = MeeshyTheme.tokens.backgroundPrimary

    Box(modifier = modifier.size(boxSize), contentAlignment = Alignment.Center) {
        when (storyRing) {
            StoryRingState.Unread -> Box(
                Modifier.size(size + ringExtra)
                    .border(ringWidth * 2, MeeshyPalette.Indigo500, CircleShape),
            )
            StoryRingState.Read -> Box(
                Modifier.size(size + ringExtra)
                    .border(ringWidth, containerColor.copy(alpha = 0.3f), CircleShape),
            )
            StoryRingState.None -> Unit
        }

        Box(
            modifier = Modifier
                .size(size)
                .clip(CircleShape)
                .background(Brush.linearGradient(listOf(containerColor, gradientEnd)))
                .semantics { contentDescription = name.ifBlank { fallbackDescription } },
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = avatarInitials(name),
                color = contentColor,
                fontFamily = NunitoFontFamily,
                fontWeight = FontWeight.Bold,
                fontSize = textSize,
            )
        }

        if (!moodEmoji.isNullOrEmpty()) {
            Text(
                text = moodEmoji,
                fontSize = with(density) { (size * 0.4f).toSp() },
                modifier = Modifier.align(Alignment.BottomEnd),
            )
        } else if (dotColor != null) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .size(size * 0.26f + 4.dp)
                    .clip(CircleShape)
                    .background(dotBorderColor)
                    .padding(2.dp)
                    .clip(CircleShape)
                    .background(dotColor),
            )
        }
    }
}
