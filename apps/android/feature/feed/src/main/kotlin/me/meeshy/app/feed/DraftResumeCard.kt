package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * « Reprendre votre brouillon » at the head of the feed (#13430, iso iOS): one row per draft the
 * device holds for this account — tap to pick it up, the cross to delete it (after a confirmation,
 * since nothing brings it back). Hidden when there is nothing to resume.
 */
@Composable
internal fun DraftResumeSection(
    onResumePost: () -> Unit,
    onResumeStory: () -> Unit,
    viewModel: DraftResumeViewModel = hiltViewModel(),
) {
    val entries by viewModel.entries.collectAsStateWithLifecycle()
    var pendingDiscard by remember { mutableStateOf<DraftResumeSource?>(null) }
    entries.forEach { entry ->
        DraftResumeCard(
            entry = entry,
            onResume = if (entry.kind == DraftResumeKind.STORY) onResumeStory else onResumePost,
            onDiscard = { pendingDiscard = entry.source },
        )
    }
    pendingDiscard?.let { source ->
        AlertDialog(
            onDismissRequest = { pendingDiscard = null },
            title = { Text(stringResource(R.string.feed_draft_resume_discard_title)) },
            text = { Text(stringResource(R.string.feed_draft_resume_discard_body)) },
            confirmButton = {
                TextButton(onClick = {
                    pendingDiscard = null
                    viewModel.discard(source)
                }) { Text(stringResource(R.string.feed_unsent_delete), color = MeeshyTheme.tokens.error) }
            },
            dismissButton = {
                TextButton(onClick = { pendingDiscard = null }) { Text(stringResource(R.string.feed_unsent_cancel)) }
            },
        )
    }
}

@Composable
private fun DraftResumeCard(entry: DraftResumeEntry, onResume: () -> Unit, onDiscard: () -> Unit) {
    val title = stringResource(R.string.feed_draft_resume_title)
    val kind = stringResource(entry.kind.labelRes())
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg)
            .padding(bottom = MeeshySpacing.sm)
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .background(MeeshyTheme.tokens.backgroundSecondary)
            .clickable(onClick = onResume)
            .semantics {
                contentDescription = "$title, $kind"
                role = Role.Button
            }
            .padding(start = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = MeeshyIcons.Edit,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.size(20.dp),
        )
        Spacer(Modifier.width(MeeshySpacing.sm))
        Column(
            modifier = Modifier.weight(1f).padding(vertical = MeeshySpacing.md),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Text(
                text = "$title · $kind",
                style = MaterialTheme.typography.labelLarge,
                color = MeeshyTheme.tokens.textSecondary,
            )
            Text(
                text = entry.text ?: pluralStringResource(R.plurals.feed_unsent_media_count, entry.mediaCount, entry.mediaCount),
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        TextButton(onClick = onResume) { Text(stringResource(R.string.feed_draft_resume_action)) }
        IconButton(onClick = onDiscard) {
            Icon(
                imageVector = MeeshyIcons.Close,
                contentDescription = stringResource(R.string.feed_unsent_delete),
                tint = MeeshyTheme.tokens.textMuted,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

private fun DraftResumeKind.labelRes(): Int = when (this) {
    DraftResumeKind.POST -> R.string.feed_unsent_kind_post
    DraftResumeKind.REEL -> R.string.feed_unsent_kind_reel
    DraftResumeKind.STORY -> R.string.feed_unsent_kind_story
}
