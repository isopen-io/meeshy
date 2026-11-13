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
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material.icons.outlined.WifiOff
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
    FeedNotice.BOOKMARKED -> R.string.feed_bookmark_success
    FeedNotice.DAILY_REACTION_LIMIT -> me.meeshy.ui.R.string.post_daily_limit_reaction_untimed
    FeedNotice.REPOSTED -> R.string.feed_repost_reposted
    FeedNotice.REPOST_FAILED -> R.string.feed_notice_repost_failed
    FeedNotice.PIN_FAILED -> R.string.feed_notice_pin_failed
    FeedNotice.PINNED -> R.string.feed_post_pinned
    FeedNotice.DELETED -> R.string.feed_post_deleted
    FeedNotice.DELETE_FAILED -> R.string.feed_notice_delete_failed
    FeedNotice.REPORT_FAILED -> R.string.feed_notice_report_failed
    FeedNotice.REPORTED -> R.string.feed_notice_reported
    FeedNotice.PUBLISH_FAILED -> R.string.feed_notice_publish_failed
    FeedNotice.PUBLISHED -> R.string.feed_notice_published
    FeedNotice.PUBLISH_QUEUED -> R.string.feed_notice_publish_queued
    FeedNotice.TRANSLATION_FAILED -> R.string.feed_notice_translation_failed
    FeedNotice.UNBOOKMARKED -> R.string.post_bookmark_removed
    FeedNotice.COMMENT_SETTINGS_FAILED -> R.string.feed_comment_settings_failed
}

/**
 * The feed's drawn empty and error states (iOS `FeedView`): an icon, a title, a line of
 * context — and, for the error, « Réessayer ». Scrollable so the pull-to-refresh of the
 * parent `PullToRefreshBox` still starts from an empty screen.
 */
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

/** Hors ligne, rien de gardé : une seule ligne, qui dit quand le fil se remplira (le bandeau dit déjà « Hors ligne ») (#14263). */
@Composable
internal fun FeedOfflineEmptyState(onRetry: () -> Unit, modifier: Modifier = Modifier) {
    FeedStatePane(
        icon = { Icon(Icons.Outlined.WifiOff, contentDescription = null, tint = MeeshyTheme.tokens.textSecondary, modifier = Modifier.size(48.dp)) },
        title = stringResource(R.string.feed_offline_empty_detail),
        subtitle = null,
        action = {
            OutlinedButton(onClick = onRetry) { Text(stringResource(R.string.feed_retry)) }
        },
        modifier = modifier,
    )
}

@Composable
internal fun FeedStatePane(
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
