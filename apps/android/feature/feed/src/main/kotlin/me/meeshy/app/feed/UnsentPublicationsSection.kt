package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.feed.R
import me.meeshy.sdk.publication.UnsentPublication
import me.meeshy.sdk.publication.UnsentPublicationKind
import me.meeshy.sdk.publication.UnsentPublicationStatus
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The feed's entry to « Publications non envoyées » (#13417): a row that appears only while the
 * device holds an unconfirmed publication, and opens the list where each one is retried,
 * reopened in the composer, or — explicitly — deleted. Hidden when there is nothing to say.
 */
@Composable
internal fun UnsentPublicationsEntry(
    onReopen: (FeedComposerDraft) -> Unit,
    onReopenStory: () -> Unit = {},
    viewModel: UnsentPublicationsViewModel = hiltViewModel(),
) {
    val items by viewModel.items.collectAsStateWithLifecycle()
    val offline by viewModel.offline.collectAsStateWithLifecycle()
    var showList by remember { mutableStateOf(false) }
    LaunchedEffect(viewModel) {
        viewModel.reopened.collect { draft ->
            showList = false
            onReopen(draft)
        }
    }
    LaunchedEffect(viewModel) {
        viewModel.reopenedStory.collect {
            showList = false
            onReopenStory()
        }
    }
    if (items.isEmpty()) return
    UnsentPublicationsBanner(items = items, onClick = { showList = true })
    if (showList) {
        UnsentPublicationsSheet(
            items = items,
            offline = offline,
            onRetry = viewModel::retry,
            onReopen = viewModel::reopen,
            onDelete = viewModel::discard,
            onDismiss = { showList = false },
        )
    }
}

@Composable
private fun UnsentPublicationsBanner(items: List<UnsentPublication>, onClick: () -> Unit) {
    val anyFailed = items.any { it.status == UnsentPublicationStatus.FAILED }
    val openLabel = stringResource(R.string.feed_unsent_open)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg)
            .padding(bottom = MeeshySpacing.sm)
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .background(MeeshyTheme.tokens.backgroundSecondary)
            .clickable(onClick = onClick)
            .semantics {
                contentDescription = openLabel
                role = Role.Button
            }
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = if (anyFailed) MeeshyIcons.SyncProblem else MeeshyIcons.Sync,
            contentDescription = null,
            tint = if (anyFailed) MeeshyTheme.tokens.error else MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.size(20.dp),
        )
        Spacer(Modifier.width(MeeshySpacing.sm))
        Text(
            text = pluralStringResource(R.plurals.feed_unsent_count, items.size, items.size),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textPrimary,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun UnsentPublicationsSheet(
    items: List<UnsentPublication>,
    offline: Boolean,
    onRetry: (String) -> Unit,
    onReopen: (String) -> Unit,
    onDelete: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var pendingDelete by remember { mutableStateOf<String?>(null) }
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = MeeshyTheme.tokens.backgroundPrimary) {
        Text(
            text = stringResource(R.string.feed_unsent_title),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        )
        LazyColumn(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            items(items, key = { it.cmid }) { item ->
                UnsentPublicationRow(
                    item = item,
                    offline = offline,
                    onRetry = { onRetry(item.cmid) },
                    onReopen = { onReopen(item.cmid) },
                    onDelete = { pendingDelete = item.cmid },
                )
            }
        }
        Spacer(Modifier.padding(bottom = MeeshySpacing.xl))
    }
    pendingDelete?.let { cmid ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text(stringResource(R.string.feed_unsent_delete_confirm_title)) },
            text = { Text(stringResource(R.string.feed_unsent_delete_confirm_body)) },
            confirmButton = {
                TextButton(onClick = {
                    pendingDelete = null
                    onDelete(cmid)
                }) { Text(stringResource(R.string.feed_unsent_delete), color = MeeshyTheme.tokens.error) }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text(stringResource(R.string.feed_unsent_cancel)) }
            },
        )
    }
}

@Composable
private fun UnsentPublicationRow(
    item: UnsentPublication,
    offline: Boolean,
    onRetry: () -> Unit,
    onReopen: () -> Unit,
    onDelete: () -> Unit,
) {
    val failed = item.status == UnsentPublicationStatus.FAILED
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = stringResource(item.kind.labelRes()),
                style = MaterialTheme.typography.labelLarge,
                color = MeeshyTheme.tokens.textSecondary,
            )
            Spacer(Modifier.width(MeeshySpacing.sm))
            Text(
                text = stringResource(if (failed) R.string.feed_unsent_failed else R.string.feed_unsent_sending),
                style = MaterialTheme.typography.labelMedium,
                color = if (failed) MeeshyTheme.tokens.error else MeeshyTheme.tokens.textMuted,
            )
        }
        Text(
            text = item.text ?: pluralStringResource(R.plurals.feed_unsent_media_count, item.mediaCount, item.mediaCount),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textPrimary,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        UnsentPublicationMedia(item, offline)
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            if (UnsentRuptureRule.showsRetry(item, UnsentRuptureRule.rupture(item, offline))) TextButton(onClick = onRetry) { Text(stringResource(R.string.feed_unsent_retry)) }
            if (item.canReopen) TextButton(onClick = onReopen) { Text(stringResource(R.string.feed_unsent_reopen)) }
            TextButton(onClick = onDelete) {
                Text(stringResource(R.string.feed_unsent_delete), color = MeeshyTheme.tokens.error)
            }
        }
    }
}

private fun UnsentPublicationKind.labelRes(): Int = when (this) {
    UnsentPublicationKind.POST -> R.string.feed_unsent_kind_post
    UnsentPublicationKind.REEL -> R.string.feed_unsent_kind_reel
    UnsentPublicationKind.STORY -> R.string.feed_unsent_kind_story
}
