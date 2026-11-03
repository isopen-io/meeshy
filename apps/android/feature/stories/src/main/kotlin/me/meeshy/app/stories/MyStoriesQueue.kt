package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.MyStoryDateLabel
import me.meeshy.sdk.story.FailedStoryPublish
import me.meeshy.sdk.story.PendingStoryPublish
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * L'onglet File : le travail RÉSEAU — publications en cours puis échecs, jamais du contenu publié ni local. C'est la
 * seule surface d'action d'un échec de publication (réessayer, ou jeter après confirmation).
 */
@Composable
internal fun MyStoriesQueue(
    pending: List<PendingStoryPublish>,
    failed: List<FailedStoryPublish>,
    nowMillis: Long,
    onRetry: (String) -> Unit,
    onDiscard: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val locale = LocalConfiguration.current.locales[0]
    LazyColumn(
        modifier = modifier,
        contentPadding = PaddingValues(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        items(pending, key = { "p-" + it.tempId }) { upload ->
            QueueRow(
                lead = { CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp) },
                title = stringResource(R.string.my_stories_upload_title),
                caption = null,
            )
        }
        if (failed.isNotEmpty()) {
            item(key = "failed-header") {
                Text(
                    stringResource(R.string.my_stories_failed_header),
                    style = MaterialTheme.typography.titleSmall,
                    color = MeeshyTheme.tokens.textSecondary,
                )
            }
        }
        items(failed, key = { "f-" + it.cmid }) { item ->
            val time = remember(item.createdAtMillis, nowMillis, locale) {
                MyStoryDateFormatter.format(MyStoryDateLabel.resolve(item.createdAtMillis, nowMillis), locale)
            }
            QueueRow(
                lead = { Icon(MeeshyIcons.WarningFilled, null, tint = MaterialTheme.colorScheme.error) },
                title = stringResource(R.string.my_stories_failed_title),
                caption = time,
                trailing = {
                    IconButton(onClick = { onRetry(item.cmid) }) {
                        Icon(MeeshyIcons.Refresh, stringResource(R.string.my_stories_retry))
                    }
                    IconButton(onClick = { onDiscard(item.cmid) }) {
                        Icon(MeeshyIcons.Delete, stringResource(R.string.my_stories_delete), tint = MaterialTheme.colorScheme.error)
                    }
                },
            )
        }
    }
}

@Composable
private fun QueueRow(
    lead: @Composable () -> Unit,
    title: String,
    caption: String?,
    trailing: @Composable () -> Unit = {},
) {
    Row(
        modifier = Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Box(
            Modifier.size(44.dp).clip(CircleShape).background(MeeshyTheme.tokens.textSecondary.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) { lead() }
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, color = MeeshyTheme.tokens.textPrimary)
            caption?.let {
                Text(it, style = MaterialTheme.typography.labelSmall, color = MeeshyTheme.tokens.textSecondary)
            }
        }
        trailing()
    }
}
