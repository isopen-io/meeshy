package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.story.FailedStoryPublish
import me.meeshy.sdk.story.PendingStoryPublish
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Les gestes d'une rangée de la file ; stables pour que la liste ne recompose que la rangée qui change. */
internal class StoryQueueActions(
    val onRetryPending: (String) -> Unit,
    val onCancelPending: (String) -> Unit,
    val onResume: (String) -> Unit,
    val onRetryFailed: (String) -> Unit,
    val onDiscardFailed: (String) -> Unit,
)

/** Un envoi actif : progression linéaire à l'accent de l'auteur, Réessayer et Annuler (iOS `ActiveUploadRow`). */
@Composable
internal fun ActiveUploadRow(
    upload: PendingStoryPublish,
    accent: androidx.compose.ui.graphics.Color,
    actions: StoryQueueActions,
) {
    val cmid = upload.cmid
    Row(
        modifier = Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Box(
            Modifier.size(44.dp).clip(CircleShape).background(accent.copy(alpha = 0.15f)),
            contentAlignment = Alignment.Center,
        ) { Icon(MeeshyIcons.Refresh, null, tint = accent) }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            Text(
                stringResource(R.string.my_stories_upload_title),
                style = MaterialTheme.typography.bodyLarge,
                color = MeeshyTheme.tokens.textPrimary,
            )
            LinearProgressIndicator(
                modifier = Modifier.fillMaxWidth(),
                color = accent,
                trackColor = accent.copy(alpha = 0.15f),
            )
        }
        if (cmid.isNotEmpty()) {
            IconButton(onClick = { actions.onRetryPending(cmid) }, modifier = Modifier.defaultMinSize(48.dp, 48.dp)) {
                Icon(MeeshyIcons.Refresh, stringResource(R.string.my_stories_retry))
            }
            IconButton(onClick = { actions.onCancelPending(cmid) }, modifier = Modifier.defaultMinSize(48.dp, 48.dp)) {
                Icon(MeeshyIcons.Close, stringResource(R.string.my_stories_cancel), tint = MaterialTheme.colorScheme.error)
            }
        }
    }
}

/**
 * Un échec de publication (iOS `FailedStoryRow`) : « Reprendre » est l'action primaire — convertir l'échec en brouillon
 * est le seul chemin qui débloque un rejet déterministe — et Réessayer l'action secondaire. Le menu contextuel (appui long)
 * et les actions d'accessibilité portent Reprendre et Supprimer.
 */
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
internal fun FailedStoryRow(
    item: FailedStoryPublish,
    timeText: String,
    isResuming: Boolean,
    actions: StoryQueueActions,
) {
    var menuOpen by remember { mutableStateOf(false) }
    val title = stringResource(R.string.my_stories_failed_title)
    val resume = stringResource(R.string.my_stories_failed_resume)
    val delete = stringResource(R.string.my_stories_delete)
    val retry = stringResource(R.string.my_stories_retry)
    val description = stringResource(R.string.my_stories_failed_a11y, timeText, "")
    Box {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .combinedClickable(onClick = {}, onLongClick = { menuOpen = true })
                .semantics(mergeDescendants = true) {
                    contentDescription = description
                    customActions = listOf(
                        CustomAccessibilityAction(resume) { if (!isResuming) actions.onResume(item.cmid); true },
                        CustomAccessibilityAction(retry) { actions.onRetryFailed(item.cmid); true },
                        CustomAccessibilityAction(delete) { actions.onDiscardFailed(item.cmid); true },
                    )
                },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            Box(
                Modifier.size(44.dp).clip(CircleShape).background(MaterialTheme.colorScheme.error.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center,
            ) { Icon(MeeshyIcons.WarningFilled, null, tint = MaterialTheme.colorScheme.error) }
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.bodyLarge, color = MeeshyTheme.tokens.textPrimary)
                Text(timeText, style = MaterialTheme.typography.labelSmall, color = MeeshyTheme.tokens.textSecondary)
            }
            Button(onClick = { actions.onResume(item.cmid) }, enabled = !isResuming) {
                Icon(MeeshyIcons.Edit, null, Modifier.size(16.dp))
                Text(resume, Modifier.padding(start = MeeshySpacing.xs))
            }
            IconButton(onClick = { actions.onRetryFailed(item.cmid) }, modifier = Modifier.defaultMinSize(48.dp, 48.dp)) {
                Icon(MeeshyIcons.Refresh, retry)
            }
        }
        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            DropdownMenuItem(
                text = { Text(resume) },
                leadingIcon = { Icon(MeeshyIcons.Edit, null) },
                enabled = !isResuming,
                onClick = { menuOpen = false; actions.onResume(item.cmid) },
            )
            DropdownMenuItem(
                text = { Text(delete, color = MaterialTheme.colorScheme.error) },
                leadingIcon = { Icon(MeeshyIcons.Delete, null, tint = MaterialTheme.colorScheme.error) },
                onClick = { menuOpen = false; actions.onDiscardFailed(item.cmid) },
            )
        }
    }
}
