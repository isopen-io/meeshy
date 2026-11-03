package me.meeshy.app.profile

import androidx.annotation.StringRes
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Les huit motifs du signalement en deux touches, dans l'ordre de la fiche iOS (`reportReasons`). */
internal object ProfileReportQuick {
    val reasons: List<ReportReason> = ReportReason.profileOrdered

    @StringRes
    fun labelRes(reason: ReportReason): Int = when (reason) {
        ReportReason.SPAM -> R.string.profile_report_quick_reason_spam
        ReportReason.INAPPROPRIATE -> R.string.profile_report_quick_reason_inappropriate
        ReportReason.HARASSMENT -> R.string.profile_report_quick_reason_harassment
        ReportReason.VIOLENCE -> R.string.profile_report_quick_reason_violence
        ReportReason.HATE_SPEECH -> R.string.profile_report_quick_reason_hate_speech
        ReportReason.FAKE_PROFILE -> R.string.profile_report_quick_reason_fake_profile
        ReportReason.IMPERSONATION -> R.string.profile_report_quick_reason_impersonation
        ReportReason.OTHER -> R.string.profile_report_quick_reason_other
    }
}

/**
 * Boîte de choix du signalement (iso `confirmationDialog` de la fiche iOS) : un motif envoie tout de suite,
 * sans détails ; « Plus de détails » ouvre l'écran de signalement complet.
 */
@Composable
internal fun ProfileReportQuickDialog(
    onReason: (ReportReason) -> Unit,
    onMoreDetails: () -> Unit,
    onDismiss: () -> Unit,
) {
    val haptics = rememberMeeshyHaptics()
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
        title = { Text(stringResource(R.string.profile_action_report), color = MeeshyPalette.Warning) },
        text = {
            Column(Modifier.fillMaxWidth()) {
                ProfileReportQuick.reasons.forEach { reason ->
                    Text(
                        text = stringResource(ProfileReportQuick.labelRes(reason)),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MeeshyTheme.tokens.textPrimary,
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .clickable(role = Role.Button) {
                                haptics.medium()
                                onReason(reason)
                            }
                            .padding(vertical = MeeshySpacing.md),
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onMoreDetails) { Text(stringResource(R.string.profile_report_quick_more_details)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(me.meeshy.ui.R.string.common_cancel)) }
        },
    )
}
