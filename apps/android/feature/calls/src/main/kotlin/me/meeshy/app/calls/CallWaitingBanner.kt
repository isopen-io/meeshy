package me.meeshy.app.calls

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Minimum touch target of the two capsules: a mis-tap answers or refuses a live call. */
internal val CALL_WAITING_TARGET_MIN = 44.dp

/**
 * The call-waiting banner (iOS `CallWaitingBannerView`): a second incoming call
 * arrived while this one is active. A dark glass banner pinned to the top — phone
 * icon, the caller on one line, "Incoming call…" — with two labelled capsules:
 * red *Decline* (keeps the current call) and green *Answer* (ends it and takes the
 * waiting one). It slides in from the top with a fade, or fades only under
 * "Reduce animations". The glass is pinned dark so the white text stays legible in
 * light mode. Pure glue: every decision lives in [CallWaitingController].
 */
@Composable
internal fun CallWaitingBanner(
    banner: WaitingBannerUi,
    onReject: () -> Unit,
    onAnswer: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val reduceMotion = LocalReduceMotion.current
    val visible = remember { MutableTransitionState(false).apply { targetState = true } }
    MeeshyTheme(darkTheme = true) {
        AnimatedVisibility(
            visibleState = visible,
            modifier = modifier,
            enter = if (reduceMotion) fadeIn() else slideInVertically { -it } + fadeIn(),
        ) {
            CallWaitingBannerContent(banner, onReject, onAnswer)
        }
    }
}

@Composable
private fun CallWaitingBannerContent(
    banner: WaitingBannerUi,
    onReject: () -> Unit,
    onAnswer: () -> Unit,
) {
    val announcement = stringResource(R.string.call_waiting_banner_a11y, banner.callerName)
    val tokens = MeeshyTheme.tokens
    MeeshyGlassSurface(
        modifier = Modifier
            .padding(horizontal = MeeshySpacing.md)
            .padding(top = MeeshySpacing.sm)
            .fillMaxWidth()
            .semantics {
                contentDescription = announcement
                liveRegion = LiveRegionMode.Polite
            },
        shape = RoundedCornerShape(MeeshyRadius.lg),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(imageVector = Icons.Filled.Call, contentDescription = null, tint = tokens.textPrimary)
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = banner.callerName,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = tokens.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = stringResource(R.string.call_waiting_subtitle),
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.textSecondary,
                    maxLines = 1,
                )
            }
            WaitingCapsule(
                label = stringResource(R.string.call_waiting_reject),
                description = stringResource(R.string.call_waiting_reject_a11y, banner.callerName),
                hint = stringResource(R.string.call_waiting_reject_hint),
                background = tokens.error,
                onClick = onReject,
            )
            WaitingCapsule(
                label = stringResource(R.string.call_waiting_answer),
                description = stringResource(R.string.call_waiting_answer_a11y, banner.callerName),
                hint = stringResource(R.string.call_waiting_answer_hint),
                background = tokens.success,
                onClick = onAnswer,
            )
        }
    }
}

@Composable
private fun WaitingCapsule(
    label: String,
    description: String,
    hint: String,
    background: Color,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .heightIn(min = CALL_WAITING_TARGET_MIN)
            .clip(CircleShape)
            .background(background)
            .clickable(onClickLabel = hint, role = Role.Button, onClick = onClick)
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Medium,
            color = Color.White,
            maxLines = 1,
        )
    }
}
