package me.meeshy.app.feed

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** The localized text of each [FeedNotice] — the iOS toast keys, adopted through the catalog. */
@StringRes
internal fun FeedNotice.messageRes(): Int = when (this) {
    FeedNotice.LOAD_FAILED -> R.string.feed_load_error
    FeedNotice.LIKE_FAILED -> R.string.feed_notice_like_failed
    FeedNotice.BOOKMARK_FAILED -> R.string.feed_notice_bookmark_failed
    FeedNotice.REPOST_FAILED -> R.string.feed_notice_repost_failed
    FeedNotice.PIN_FAILED -> R.string.feed_notice_pin_failed
    FeedNotice.DELETE_FAILED -> R.string.feed_notice_delete_failed
    FeedNotice.REPORT_FAILED -> R.string.feed_notice_report_failed
    FeedNotice.REPORTED -> R.string.feed_notice_reported
    FeedNotice.PUBLISH_FAILED -> R.string.feed_notice_publish_failed
    FeedNotice.PUBLISHED -> R.string.feed_notice_published
    FeedNotice.TRANSLATION_FAILED -> R.string.feed_notice_translation_failed
}

/**
 * The feed's drawn empty and error states (iOS `FeedView`): an icon, a title, a line of
 * context — and, for the error, « Réessayer ». Scrollable so the pull-to-refresh of the
 * parent `PullToRefreshBox` still starts from an empty screen.
 */
@Composable
internal fun FeedEmptyState(modifier: Modifier = Modifier) {
    FeedStatePane(
        icon = { Icon(Icons.Outlined.ChatBubbleOutline, contentDescription = null, tint = MeeshyTheme.tokens.textSecondary, modifier = Modifier.size(48.dp)) },
        title = stringResource(R.string.feed_empty),
        subtitle = stringResource(R.string.feed_empty_subtitle),
        modifier = modifier,
    )
}

@Composable
internal fun FeedErrorState(onRetry: () -> Unit, modifier: Modifier = Modifier) {
    FeedStatePane(
        icon = { Icon(Icons.Outlined.WarningAmber, contentDescription = null, tint = MeeshyTheme.tokens.textSecondary, modifier = Modifier.size(48.dp)) },
        title = stringResource(R.string.feed_load_error),
        subtitle = null,
        action = {
            OutlinedButton(onClick = onRetry) { Text(stringResource(R.string.feed_retry)) }
        },
        modifier = modifier,
    )
}

@Composable
private fun FeedStatePane(
    icon: @Composable () -> Unit,
    title: String,
    subtitle: String?,
    modifier: Modifier = Modifier,
    action: (@Composable () -> Unit)? = null,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.xl, vertical = 64.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        icon()
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            modifier = Modifier.semantics(mergeDescendants = true) {},
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
                textAlign = TextAlign.Center,
            )
            subtitle?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MeeshyTheme.tokens.textSecondary,
                    textAlign = TextAlign.Center,
                )
            }
        }
        action?.invoke()
    }
}

/** The next page is on its way: two ghost cards, never a spinner on a bare background (iOS #6987). */
@Composable
internal fun FeedLoadingMoreCards() {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        repeat(2) {
            MeeshySkeletonBox(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(120.dp),
                shape = RoundedCornerShape(MeeshyRadius.xl),
            )
        }
    }
}
