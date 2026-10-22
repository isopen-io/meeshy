package me.meeshy.app.conversations

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import me.meeshy.feature.conversations.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@Composable
internal fun ConnectionBannerStrip(banner: ConnectionBanner, modifier: Modifier = Modifier) {
    AnimatedVisibility(visible = banner != ConnectionBanner.HIDDEN, modifier = modifier) {
        val (label, background, foreground) = when (banner) {
            ConnectionBanner.SYNCING -> Triple(
                stringResource(R.string.conversations_banner_syncing),
                MeeshyTheme.tokens.backgroundTertiary,
                MeeshyTheme.tokens.textSecondary,
            )
            ConnectionBanner.RECONNECTING -> Triple(
                stringResource(R.string.conversations_banner_reconnecting),
                MeeshyPalette.Warning.copy(alpha = 0.18f),
                MeeshyPalette.Warning,
            )
            else -> Triple(
                stringResource(R.string.conversations_banner_offline),
                MeeshyTheme.tokens.backgroundTertiary,
                MeeshyTheme.tokens.textSecondary,
            )
        }
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = foreground,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .background(background)
                .padding(vertical = MeeshySpacing.xs),
        )
    }
}
