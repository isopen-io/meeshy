package me.meeshy.app.stories

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.MyStoriesTab
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** État vide dédié à un onglet : une ligne (« Aucune story envoyée », « Aucune publication en cours ou en échec », …). */
@Composable
internal fun MyStoriesEmpty(tab: MyStoriesTab, modifier: Modifier = Modifier) {
    val title = when (tab) {
        MyStoriesTab.PUBLISHED -> R.string.my_stories_empty_title
        MyStoriesTab.QUEUE -> R.string.my_stories_queue_empty_title
        MyStoriesTab.DRAFTS -> R.string.my_stories_drafts_empty_title
        MyStoriesTab.ARCHIVE -> R.string.my_stories_archive_empty_title
    }
    Column(
        modifier = modifier.fillMaxSize().padding(MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = when (tab) {
                MyStoriesTab.QUEUE -> MeeshyIcons.Refresh
                MyStoriesTab.DRAFTS -> MeeshyIcons.Edit
                else -> MeeshyIcons.AddPhoto
            },
            contentDescription = null,
            tint = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.size(40.dp),
        )
        Spacer(Modifier.size(MeeshySpacing.sm))
        Text(
            stringResource(title),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
            textAlign = TextAlign.Center,
        )
    }
}
