package me.meeshy.app.stories

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.ContentRemovalReason
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshySpacing

private val REPORTABLE_REASONS: List<ReportReason> = ReportReason.entries.filterNot { it == ReportReason.FAKE_PROFILE }

/**
 * Le signalement d'une story — iOS `ReportMessageSheet` : un motif, un détail libre facultatif, puis l'envoi, qui
 * rend une haptique de succès ou d'erreur et referme la feuille. [onSend] reçoit l'issue par son dernier argument.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun StoryReportSheet(
    onDismiss: () -> Unit,
    onSend: (reason: ReportReason, details: String?, done: (Boolean) -> Unit) -> Unit,
) {
    val haptics = rememberMeeshyHaptics()
    var selected by remember { mutableStateOf<ReportReason?>(null) }
    var details by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Text(stringResource(R.string.stories_report_title), style = MaterialTheme.typography.titleMedium)
            REPORTABLE_REASONS.forEach { reason ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .selectable(selected = selected == reason, role = Role.RadioButton, onClick = { selected = reason }),
                ) {
                    RadioButton(selected = selected == reason, onClick = null)
                    Text(
                        text = storyReportReasonLabel(reason),
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier.padding(start = MeeshySpacing.sm, top = MeeshySpacing.sm, bottom = MeeshySpacing.sm),
                    )
                }
            }
            OutlinedTextField(
                value = details,
                onValueChange = { details = it },
                placeholder = { Text(stringResource(R.string.stories_header_report_details)) },
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                enabled = selected != null && !sending,
                onClick = {
                    val reason = selected ?: return@Button
                    sending = true
                    onSend(reason, details) { ok ->
                        if (ok) haptics.success() else haptics.error()
                        onDismiss()
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text(stringResource(R.string.stories_header_report_send)) }
        }
    }
}

/** Le retrait par la modération : le motif est exigé (3 à 500 caractères), sans quoi rien ne part. */
@Composable
internal fun StoryRemoveDialog(onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    var reason by remember { mutableStateOf("") }
    val valid = ContentRemovalReason.normalized(reason) != null
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.stories_header_remove_title)) },
        text = {
            OutlinedTextField(
                value = reason,
                onValueChange = { reason = it.take(ContentRemovalReason.MAX_LENGTH) },
                placeholder = { Text(stringResource(R.string.stories_header_remove_hint)) },
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton(enabled = valid, onClick = { onConfirm(reason) }) { Text(stringResource(R.string.stories_header_remove)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.stories_cancel)) } },
    )
}

@Composable
private fun storyReportReasonLabel(reason: ReportReason): String = when (reason) {
    ReportReason.SPAM -> stringResource(R.string.stories_report_reason_spam)
    ReportReason.HARASSMENT -> stringResource(R.string.stories_report_reason_harassment)
    ReportReason.INAPPROPRIATE -> stringResource(R.string.stories_report_reason_inappropriate)
    ReportReason.VIOLENCE -> stringResource(R.string.stories_report_reason_violence)
    ReportReason.HATE_SPEECH -> stringResource(R.string.stories_report_reason_hate_speech)
    ReportReason.IMPERSONATION -> stringResource(R.string.stories_report_reason_impersonation)
    ReportReason.OTHER, ReportReason.FAKE_PROFILE -> stringResource(R.string.stories_report_reason_other)
}
