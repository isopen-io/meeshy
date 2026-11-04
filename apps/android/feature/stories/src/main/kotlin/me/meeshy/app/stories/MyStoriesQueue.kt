package me.meeshy.app.stories

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.MyStoryDateLabel
import me.meeshy.sdk.story.FailedStoryPublish
import me.meeshy.sdk.story.PendingStoryPublish
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * L'onglet File : le travail RÉSEAU — envois actifs puis échecs sous « Échecs de publication », jamais du contenu publié ni
 * local. C'est la seule surface d'action d'un échec de publication (la bande du plateau reste informative).
 */
@Composable
internal fun MyStoriesQueue(
    pending: List<PendingStoryPublish>,
    failed: List<FailedStoryPublish>,
    nowMillis: Long,
    accentHex: String,
    resumingCmid: String?,
    actions: StoryQueueActions,
    modifier: Modifier = Modifier,
) {
    val locale = LocalConfiguration.current.locales[0]
    val accent = hexColor(accentHex, MaterialTheme.colorScheme.primary)
    LazyColumn(
        modifier = modifier,
        contentPadding = PaddingValues(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        items(pending, key = { "p-" + it.tempId }, contentType = { "pending" }) { upload ->
            ActiveUploadRow(upload, accent, actions)
        }
        if (failed.isNotEmpty()) {
            item(key = "failed-header", contentType = "header") {
                Text(
                    stringResource(R.string.my_stories_failed_header),
                    style = MaterialTheme.typography.titleSmall,
                    color = MeeshyTheme.tokens.textSecondary,
                )
            }
        }
        items(failed, key = { "f-" + it.cmid }, contentType = { "failed" }) { item ->
            val time = remember(item.createdAtMillis, nowMillis, locale) {
                MyStoryDateFormatter.format(MyStoryDateLabel.resolve(item.createdAtMillis, nowMillis), locale)
            }
            FailedStoryRow(item, time, isResuming = resumingCmid == item.cmid, actions = actions)
        }
    }
}
