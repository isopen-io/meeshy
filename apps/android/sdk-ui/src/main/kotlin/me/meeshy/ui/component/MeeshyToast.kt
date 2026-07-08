package me.meeshy.ui.component

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Feedback toast severity. Mirrors the two-tier in-app notification system
 * (apps/ios/CLAUDE.md « Notifications In-App ») — this is the *local action
 * feedback* tier (success/error/info of a user action), NOT the network one.
 */
public enum class FeedbackKind { Success, Error, Info }

/** Accent colour for a feedback [kind]. Pure so it stays unit-testable off Compose. */
internal fun feedbackAccentColor(kind: FeedbackKind): Color = when (kind) {
    FeedbackKind.Success -> MeeshyPalette.Success
    FeedbackKind.Error -> MeeshyPalette.Error
    FeedbackKind.Info -> MeeshyPalette.Info
}

private fun feedbackDefaultIcon(kind: FeedbackKind): ImageVector = when (kind) {
    FeedbackKind.Success -> Icons.Filled.CheckCircle
    FeedbackKind.Error -> Icons.Filled.Warning
    FeedbackKind.Info -> Icons.Filled.Info
}

/**
 * The **feedback** toast (parity plan §4.6, tier 1): a single-line glass pill with a
 * severity icon + message, for the result of a local user action. The presenter owns
 * timing/queue/animation (wrap in `AnimatedVisibility` for the slide+fade); this atom
 * is the static view.
 */
@Composable
public fun MeeshyFeedbackToast(
    message: String,
    modifier: Modifier = Modifier,
    kind: FeedbackKind = FeedbackKind.Info,
    icon: ImageVector = feedbackDefaultIcon(kind),
) {
    MeeshyGlassSurface(
        modifier = modifier,
        shape = RoundedCornerShape(MeeshyRadius.pill),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = feedbackAccentColor(kind),
                modifier = Modifier.size(20.dp),
            )
            Spacer(Modifier.width(MeeshySpacing.sm))
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/**
 * The **notification** toast (parity plan §4.6, tier 2): a rich glass card — sender
 * avatar + name + conversation title — surfaced from a network event (socket / push),
 * tappable to deep-link. Reuses [MeeshyAvatar]. The presenter owns timing/animation.
 */
@Composable
public fun MeeshyNotificationToast(
    senderName: String,
    title: String,
    modifier: Modifier = Modifier,
    avatarName: String = senderName,
    accentColor: Color = MeeshyPalette.Indigo500,
    onTap: (() -> Unit)? = null,
) {
    val tapModifier = if (onTap != null) Modifier.clickable(onClick = onTap) else Modifier
    MeeshyGlassSurface(
        modifier = modifier.then(tapModifier),
        shape = RoundedCornerShape(MeeshyRadius.xl),
    ) {
        Row(
            modifier = Modifier.padding(MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MeeshyAvatar(name = avatarName, size = 44.dp, containerColor = accentColor)
            Spacer(Modifier.width(MeeshySpacing.md))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = senderName,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
