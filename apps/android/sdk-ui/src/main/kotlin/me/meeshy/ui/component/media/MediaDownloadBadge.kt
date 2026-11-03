package me.meeshy.ui.component.media

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.media.DownloadBadgeState
import me.meeshy.sdk.model.media.MediaAvailabilityState
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.accessibility.meeshyTapTarget
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/**
 * **Le badge de disponibilité d'une pièce média** : rien quand elle est prête ; la flèche « télécharger » avec sa taille
 * (désactivée et dite « Hors ligne » sans réseau) ; l'anneau avec « 410 KB / 850 KB » pendant le transfert (un toucher
 * annule) ; « Réessayer » après un échec. Projection mince de [MediaAvailabilityState] ; l'accent arrive en PARAMÈTRE.
 */
@Composable
public fun MediaDownloadBadge(
    state: MediaAvailabilityState,
    accent: Color,
    onDownload: () -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
    compact: Boolean = false,
) {
    when (state) {
        MediaAvailabilityState.Ready -> Unit
        is MediaAvailabilityState.NeedsDownload ->
            if (state.offline) OfflineBadge(state, modifier) else DownloadBadge(DownloadBadgeState.Idle(state.sizeBytes), accent, onDownload, onCancel, modifier, compact)
        is MediaAvailabilityState.Downloading -> DownloadingBadge(state, accent, onCancel, modifier)
        is MediaAvailabilityState.Failed -> RetryBadge(state, onDownload, modifier)
    }
}

@Composable
private fun DownloadingBadge(state: MediaAvailabilityState.Downloading, accent: Color, onCancel: () -> Unit, modifier: Modifier) {
    val label = stringResource(R.string.a11y_media_download_cancel)
    val bytes = state.bytesLabel
    val percent = state.percent
    Row(
        modifier = modifier
            .semantics(mergeDescendants = true) {
                contentDescription = label
                role = Role.Button
                stateDescription = "$bytes, $percent%"
            }
            .clickable(onClick = onCancel)
            .meeshyTapTarget()
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(MediaBadgeScrim)
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        androidx.compose.material3.CircularProgressIndicator(
            progress = { state.progress.toFloat() },
            modifier = Modifier.size(20.dp).decorative(),
            color = accent,
            trackColor = MeeshyMediaChromeColors.MediaHairline,
            strokeWidth = 2.5.dp,
        )
        Text(text = bytes, color = MeeshyMediaChromeColors.OnMedia, fontSize = 11.sp, maxLines = 1, modifier = Modifier.decorative())
    }
}

@Composable
private fun OfflineBadge(state: MediaAvailabilityState.NeedsDownload, modifier: Modifier) {
    val download = stringResource(R.string.a11y_media_download_action)
    val offline = stringResource(R.string.media_availability_offline)
    Row(
        modifier = modifier
            .semantics(mergeDescendants = true) {
                contentDescription = download
                role = Role.Button
                disabled()
                stateDescription = offline
            }
            .alpha(0.6f)
            .meeshyTapTarget()
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(MediaBadgeScrim)
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(MeeshyIcons.WifiOff, contentDescription = null, tint = MeeshyMediaChromeColors.OnMedia, modifier = Modifier.size(16.dp))
        Text(text = listOfNotNull(offline, state.sizeLabel).joinToString(" · "), color = MeeshyMediaChromeColors.OnMedia, fontSize = 11.sp, maxLines = 1)
    }
}

@Composable
private fun RetryBadge(state: MediaAvailabilityState.Failed, onRetry: () -> Unit, modifier: Modifier) {
    val retry = stringResource(R.string.media_availability_retry)
    val gone = stringResource(R.string.media_availability_gone)
    Row(
        modifier = modifier
            .semantics(mergeDescendants = true) {
                contentDescription = retry
                role = Role.Button
                if (state.gone) stateDescription = gone
            }
            .clickable(onClick = onRetry)
            .meeshyTapTarget()
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(MediaBadgeScrim)
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(MeeshyIcons.Refresh, contentDescription = null, tint = MeeshyMediaChromeColors.OnMedia, modifier = Modifier.size(16.dp))
        Text(text = retry, color = MeeshyMediaChromeColors.OnMedia, fontSize = 11.sp, maxLines = 1)
    }
}

private val MediaBadgeScrim = MeeshyMediaChromeColors.MediaBackdrop.copy(alpha = 0.55f)
