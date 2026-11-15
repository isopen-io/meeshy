package me.meeshy.app.reels

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.reels.R
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.model.report.ReportReasonPresentation
import me.meeshy.ui.component.report.ReportReasonList

/** Les motifs offerts pour signaler un réel : ceux d'un message, sans le faux profil. */
private val REEL_REASONS: List<ReportReasonPresentation> = ReportReason.messageOrdered
    .filterNot { it == ReportReason.FAKE_PROFILE }
    .map { ReportReasonPresentation.of(it) }

/** Le dialogue de motifs du signalement d'un réel (iOS `reportPost`, motif choisi) : un motif, puis « Signaler ». */
@Composable
internal fun ReelReportDialog(onDismiss: () -> Unit, onPick: (ReportReason) -> Unit) {
    var selected by remember { mutableStateOf(ReportReason.INAPPROPRIATE) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.reels_menu_report)) },
        text = {
            ReportReasonList(
                reasons = REEL_REASONS,
                selected = selected,
                onSelect = { selected = it },
                label = { stringResource(reelReasonLabel(it.reason)) },
            )
        },
        confirmButton = { TextButton(onClick = { onPick(selected) }) { Text(stringResource(R.string.reels_menu_report)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(me.meeshy.ui.R.string.common_cancel)) } },
    )
}

private fun reelReasonLabel(reason: ReportReason): Int = when (reason) {
    ReportReason.SPAM -> R.string.reels_report_reason_spam
    ReportReason.HARASSMENT -> R.string.reels_report_reason_harassment
    ReportReason.INAPPROPRIATE -> R.string.reels_report_reason_inappropriate
    ReportReason.VIOLENCE -> R.string.reels_report_reason_violence
    ReportReason.HATE_SPEECH -> R.string.reels_report_reason_hate_speech
    ReportReason.IMPERSONATION -> R.string.reels_report_reason_impersonation
    ReportReason.OTHER, ReportReason.FAKE_PROFILE -> R.string.reels_report_reason_other
}
