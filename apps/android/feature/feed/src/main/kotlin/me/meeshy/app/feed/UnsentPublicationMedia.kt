package me.meeshy.app.feed

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.media.MediaFate
import me.meeshy.sdk.model.media.MediaUploadProgress
import me.meeshy.sdk.model.media.PublicationRupture
import me.meeshy.sdk.model.media.RuptureGesture
import me.meeshy.sdk.publication.UnsentMedia
import me.meeshy.sdk.publication.UnsentPublication
import me.meeshy.ui.component.media.UploadProgressLine
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * What an unsent publication says about each of its media and, when something broke, what is
 * missing, what is intact and the one gesture that helps (#13429; iOS `3d` / `2j`). A publication
 * going well says nothing beyond its per-media progress.
 */
@Composable
internal fun UnsentPublicationMedia(item: UnsentPublication, offline: Boolean) {
    if (item.media.isEmpty()) return
    val rupture = UnsentRuptureRule.rupture(item, offline)
    Column(verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.fillMaxWidth()) {
        item.media.forEachIndexed { index, media -> UnsentMediaRow(index + 1, media) }
        if (UnsentRuptureRule.speaks(item, rupture)) UnsentRuptureText(item, rupture)
    }
}

@Composable
private fun UnsentMediaRow(number: Int, media: UnsentMedia) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            Text(
                text = stringResource(R.string.feed_unsent_media_row, number),
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textSecondary,
            )
            Text(
                text = stringResource(media.fate.labelRes()),
                style = MaterialTheme.typography.labelMedium,
                color = if (media.fate.isBroken()) MeeshyTheme.tokens.error else MeeshyTheme.tokens.textMuted,
            )
        }
        (media.progress as? MediaUploadProgress.Uploading)?.let { UploadProgressLine(it) }
    }
}

@Composable
private fun UnsentRuptureText(item: UnsentPublication, rupture: PublicationRupture) {
    val counts = if (rupture.missing > 0) {
        stringResource(R.string.feed_unsent_rupture_counts, rupture.missing, rupture.intact) + " "
    } else {
        ""
    }
    val gesture = stringResource(
        when (rupture.gesture) {
            RuptureGesture.REPLACE_MISSING ->
                if (UnsentRuptureRule.replaceByRecomposing(item)) {
                    R.string.feed_unsent_gesture_replace_story
                } else {
                    R.string.feed_unsent_gesture_replace
                }
            RuptureGesture.WAIT_FOR_NETWORK -> R.string.feed_unsent_gesture_wait
            RuptureGesture.RETRY, RuptureGesture.NONE -> R.string.feed_unsent_gesture_retry
        },
    )
    Text(
        text = counts + gesture,
        style = MaterialTheme.typography.bodySmall,
        color = MeeshyTheme.tokens.textSecondary,
    )
}

private fun MediaFate.isBroken(): Boolean = this == MediaFate.LOST || this == MediaFate.REFUSED || this == MediaFate.LOCATION_REFUSED

private fun MediaFate.labelRes(): Int = when (this) {
    MediaFate.UPLOADED -> R.string.feed_unsent_media_uploaded
    MediaFate.WAITING -> R.string.feed_unsent_media_waiting
    MediaFate.REFUSED -> R.string.feed_unsent_media_refused
    MediaFate.LOST -> R.string.feed_unsent_media_lost
    MediaFate.LOCATION_REFUSED -> R.string.feed_unsent_media_location_refused
}
