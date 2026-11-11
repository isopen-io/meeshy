package me.meeshy.app.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.mediacache.ByteSizeFormatter
import me.meeshy.sdk.model.mediacache.CacheDataKind
import me.meeshy.sdk.model.mediacache.CachePurgeButtonState
import me.meeshy.sdk.model.mediacache.CachePurgeReport
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.settings.SettingsCard
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.component.MeeshyInfoNote
import me.meeshy.ui.component.MeeshyInfoNoteButton
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Tableau de purge sélective (iOS `SelectiveCachePurgeView`) : une carte par type, la section « Médias orphelins »,
 * « Tout sélectionner » et le bouton « Vider — jusqu'à X » précédé d'une alerte. Projection mince de
 * [SelectiveCachePurgeUiState] ; la mesure se déclenche à l'apparition.
 */
@Composable
internal fun SelectiveCachePurgeContent(
    state: SelectiveCachePurgeUiState,
    onEvent: (SelectiveCachePurgeEvent) -> Unit,
) {
    LaunchedEffect(Unit) { onEvent(SelectiveCachePurgeEvent.Appeared) }
    val report = state.report
    val noteHost = rememberNoteHost()
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xl)) {
        if (report == null) {
            CachePurgeSkeleton()
        } else {
            CacheDataKind.entries.forEach { kind ->
                CachePurgeKindSection(
                    kind = kind,
                    report = report,
                    selection = state.selection,
                    onToggleKind = { onEvent(SelectiveCachePurgeEvent.ToggleKind(kind)) },
                    onToggleCell = { onEvent(SelectiveCachePurgeEvent.ToggleCell(it)) },
                    noteHost = noteHost,
                )
            }
            UnattributedSection(report, state.selection.includeUnattributed, noteHost) {
                onEvent(SelectiveCachePurgeEvent.ToggleUnattributed)
            }
            CachePurgeActions(state, onEvent)
        }
    }
    if (state.isConfirming) PurgeConfirmDialog(onEvent)
}

@Composable
private fun CachePurgeSkeleton() {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg)) {
        repeat(3) {
            MeeshySkeletonBox(
                modifier = Modifier.fillMaxWidth().defaultMinSize(minHeight = 132.dp),
                shape = RoundedCornerShape(MeeshyRadius.xxl),
            )
        }
    }
}

@Composable
private fun UnattributedSection(report: CachePurgeReport, included: Boolean, noteHost: NoteHost, onToggle: () -> Unit) {
    val bytes = report.unattributedBytes
    if (bytes <= 0L) return
    val haptics = rememberMeeshyHaptics()
    val neutral = MeeshyPalette.Neutral500
    val state = stringResource(if (included) R.string.cache_purge_cell_selected else R.string.cache_purge_cell_unselected)
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Row(
            modifier = Modifier.padding(start = MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        ) {
            Icon(MeeshyIcons.FolderFilled, contentDescription = null, tint = neutral, modifier = Modifier.size(14.dp))
            Text(
                text = stringResource(R.string.purge_unattributed_title).uppercase(),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = neutral,
            )
        }
        val note = MeeshyInfoNote(
            question = stringResource(R.string.purge_unattributed_question),
            text = stringResource(R.string.purge_unattributed_note),
        )
        SettingsCard(tint = neutral) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .defaultMinSize(minHeight = 48.dp)
                        .clickable(role = Role.Checkbox) {
                            haptics.light()
                            onToggle()
                        }
                        .semantics(mergeDescendants = true) { stateDescription = state }
                        .padding(start = MeeshySpacing.lg, top = MeeshySpacing.smPlus, bottom = MeeshySpacing.smPlus),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                ) {
                    Icon(
                        imageVector = if (included) MeeshyIcons.CheckBoxChecked else MeeshyIcons.CheckBoxBlank,
                        contentDescription = null,
                        tint = if (included) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.textMuted,
                        modifier = Modifier.size(24.dp),
                    )
                    Text(
                        text = stringResource(R.string.purge_unattributed_title),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                        color = MeeshyTheme.tokens.textPrimary,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        text = ByteSizeFormatter.format(bytes),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MeeshyTheme.tokens.textPrimary,
                    )
                }
                MeeshyInfoNoteButton(note = note, expanded = noteHost.isOpen(note), onToggle = { noteHost.toggle(note) })
            }
            if (noteHost.isOpen(note)) {
                Text(
                    text = note.text,
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textMuted,
                    modifier = Modifier.padding(start = MeeshySpacing.lg, end = MeeshySpacing.lg, bottom = MeeshySpacing.sm),
                )
            }
        }
    }
}

@Composable
private fun CachePurgeActions(state: SelectiveCachePurgeUiState, onEvent: (SelectiveCachePurgeEvent) -> Unit) {
    val haptics = rememberMeeshyHaptics()
    val danger = MeeshyPalette.ErrorStrong
    val enabled = state.canPurge
    val title = when (val button = state.button) {
        CachePurgeButtonState.NothingSelected -> stringResource(R.string.purge_action_empty)
        is CachePurgeButtonState.UpTo -> stringResource(R.string.purge_action_with_size, ByteSizeFormatter.format(button.bytes))
    }
    val hint = stringResource(R.string.purge_action_hint)
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
    ) {
        TextButton(onClick = {
            haptics.medium()
            onEvent(SelectiveCachePurgeEvent.ToggleAll)
        }) {
            Text(
                text = stringResource(R.string.purge_select_all),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = MeeshyPalette.Indigo500,
            )
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .defaultMinSize(minHeight = 48.dp)
                .background(danger.copy(alpha = if (state.hasSelection) 0.12f else 0.04f), RoundedCornerShape(MeeshyRadius.md))
                .clickable(enabled = enabled, role = Role.Button, onClickLabel = hint) {
                    haptics.medium()
                    onEvent(SelectiveCachePurgeEvent.RequestPurge)
                }
                .padding(vertical = MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm, Alignment.CenterHorizontally),
        ) {
            val ink = if (state.hasSelection) danger else MeeshyTheme.tokens.textMuted
            if (state.isPurging) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp), color = ink, strokeWidth = 2.dp)
            } else {
                Icon(MeeshyIcons.DeleteFilled, contentDescription = null, tint = ink, modifier = Modifier.size(18.dp))
            }
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = ink,
            )
        }
        state.freedBytes?.let { freed ->
            Text(
                text = stringResource(R.string.cache_purge_freed, ByteSizeFormatter.format(freed)),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
                textAlign = TextAlign.Center,
            )
        }
        if (state.purgeFailed) {
            Text(
                text = stringResource(R.string.cache_purge_failed),
                style = MaterialTheme.typography.bodySmall,
                color = danger,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun PurgeConfirmDialog(onEvent: (SelectiveCachePurgeEvent) -> Unit) {
    AlertDialog(
        onDismissRequest = { onEvent(SelectiveCachePurgeEvent.DismissConfirm) },
        title = { Text(stringResource(R.string.purge_confirm_title)) },
        text = { Text(stringResource(R.string.purge_confirm_message)) },
        confirmButton = {
            TextButton(onClick = { onEvent(SelectiveCachePurgeEvent.ConfirmPurge) }) {
                Text(stringResource(R.string.purge_confirm_action), color = MeeshyPalette.ErrorStrong)
            }
        },
        dismissButton = {
            TextButton(onClick = { onEvent(SelectiveCachePurgeEvent.DismissConfirm) }) {
                Text(stringResource(R.string.media_cache_confirm_cancel))
            }
        },
    )
}
