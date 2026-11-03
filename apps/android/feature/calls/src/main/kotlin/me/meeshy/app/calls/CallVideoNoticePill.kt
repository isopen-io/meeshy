package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallVideoNotice
import me.meeshy.ui.theme.MeeshySpacing

private const val NOTICE_SCRIM_ALPHA = 0.5f

/**
 * L'indicateur discret de ma vidéo : image réduite pour laisser refroidir le téléphone, ou lumière
 * insuffisante. Une puce de texte, annoncée aux lecteurs d'écran, qui disparaît d'elle-même au retour à la normale.
 */
@Composable
internal fun CallVideoNoticePill(notice: CallVideoNotice, modifier: Modifier = Modifier) {
    val text = when (notice) {
        CallVideoNotice.None -> return
        CallVideoNotice.Reduced -> stringResource(R.string.call_video_notice_reduced)
        CallVideoNotice.LowLight -> stringResource(R.string.call_video_notice_low_light)
    }
    Box(
        modifier = modifier
            .clip(CircleShape)
            .background(CallPalette.Veil.copy(alpha = NOTICE_SCRIM_ALPHA))
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs)
            .semantics { liveRegion = LiveRegionMode.Polite },
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelMedium,
            color = CallPalette.Ink,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
