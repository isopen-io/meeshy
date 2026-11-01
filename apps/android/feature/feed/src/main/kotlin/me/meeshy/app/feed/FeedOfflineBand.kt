package me.meeshy.app.feed

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import me.meeshy.feature.feed.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/** Le bandeau discret du fil hors ligne (#14263) : les publications gardées restent lisibles dessous, la teinte est celle du bandeau des conversations. */
@Composable
internal fun FeedOfflineBand(visible: Boolean, modifier: Modifier = Modifier) {
    AnimatedVisibility(visible = visible, modifier = modifier) {
        Text(
            text = stringResource(R.string.feed_offline_banner),
            style = MaterialTheme.typography.labelMedium,
            color = MeeshyPalette.Warning,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .background(MeeshyPalette.Warning.copy(alpha = 0.18f))
                .padding(vertical = MeeshySpacing.xs)
                .semantics { liveRegion = LiveRegionMode.Polite },
        )
    }
}
