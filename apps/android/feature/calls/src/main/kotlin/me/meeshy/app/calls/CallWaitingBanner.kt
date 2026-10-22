package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The call-waiting banner: a second incoming call arrived while this one is
 * active. Pinned to the top, it offers *Decline* (end the waiting call, keep this
 * one) and *Answer* (end this call and take the waiting one). Colour-coherent with
 * the call controls — the answer action carries the peer [accent], the reject the
 * semantic error hue. Pure glue: every decision lives in [CallViewModel].
 */
@Composable
internal fun CallWaitingBanner(
    banner: WaitingBannerUi,
    accent: Color,
    onReject: () -> Unit,
    onAnswer: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val bannerLabel = stringResource(R.string.call_waiting_banner_a11y, banner.callerName)
    Row(
        modifier = modifier
            .padding(MeeshySpacing.md)
            .clip(RoundedCornerShape(16.dp))
            .background(MeeshyTheme.tokens.backgroundSecondary)
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md)
            .semantics { contentDescription = bannerLabel },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md, Alignment.Start),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.width(140.dp)) {
            Text(
                text = banner.callerName,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Text(
                text = stringResource(R.string.call_waiting_subtitle),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
        Spacer(Modifier.width(MeeshySpacing.sm))
        CallCircleButton(
            icon = Icons.Filled.CallEnd,
            background = MaterialTheme.colorScheme.error,
            contentDescription = stringResource(R.string.call_waiting_reject_a11y, banner.callerName),
            onClick = onReject,
        )
        CallCircleButton(
            icon = Icons.Filled.Call,
            background = accent,
            contentDescription = stringResource(R.string.call_waiting_answer_a11y, banner.callerName),
            onClick = onAnswer,
        )
    }
}
