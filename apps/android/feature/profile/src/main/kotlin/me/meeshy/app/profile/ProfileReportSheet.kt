package me.meeshy.app.profile

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.ui.component.kit.MeeshyButton
import me.meeshy.ui.component.kit.MeeshyButtonKind
import me.meeshy.ui.component.kit.MeeshyButtonWidth
import me.meeshy.ui.component.kit.MeeshyChoiceItem
import me.meeshy.ui.component.kit.MeeshyChoiceSelection
import me.meeshy.ui.component.kit.MeeshyChoiceTiles
import me.meeshy.ui.component.kit.MeeshyToggleRow
import me.meeshy.ui.component.kit.MeeshyToggleRowAccessory
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Les libellés des motifs du signalement, dans l'ordre de la fiche iOS (`reportReasons`). */
internal object ProfileReportQuick {
    val reasons: List<ReportReason> = ProfileReportDraft.reasons

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
 * « Signaler » en tuiles de choix (K47) : on choisit UN motif, « Bloquer aussi » est une option, et « Signaler »
 * n'envoie qu'après le choix. « Plus de détails » garde l'écran de signalement complet de la fiche.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ProfileReportSheet(
    displayName: String,
    alreadyBlocked: Boolean,
    onSend: (ProfileReportSubmission) -> Unit,
    onMoreDetails: () -> Unit,
    onDismiss: () -> Unit,
) {
    var draft by remember { mutableStateOf(ProfileReportDraft()) }
    val haptics = rememberMeeshyHaptics()
    val items = ProfileReportDraft.reasons.map { reason ->
        MeeshyChoiceItem(id = reason.wireValue, title = stringResource(ProfileReportQuick.labelRes(reason)))
    }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
        contentWindowInsets = { WindowInsets(0, 0, 0, 0) },
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            Text(
                text = stringResource(R.string.profile_report_sheet_title, displayName),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.ExtraBold,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Text(
                text = stringResource(R.string.profile_report_sheet_hint),
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textSecondary,
            )
            Text(
                text = stringResource(R.string.profile_report_sheet_question),
                style = MaterialTheme.typography.titleSmall,
                color = MeeshyTheme.tokens.textPrimary,
            )
            MeeshyChoiceTiles(
                items = items,
                selection = MeeshyChoiceSelection.Single(draft.reason?.wireValue),
                onSelect = { id ->
                    ProfileReportDraft.reasons.firstOrNull { it.wireValue == id }?.let { draft = draft.choose(it) }
                },
                columns = 2,
            )
            if (ProfileReportDraft.offersBlock(alreadyBlocked)) {
                MeeshyToggleRow(
                    title = stringResource(R.string.profile_report_also_block, displayName),
                    accessory = MeeshyToggleRowAccessory.Toggle(isOn = draft.alsoBlock),
                    icon = MeeshyIcons.Block,
                    onClick = { draft = draft.toggleBlock() },
                )
            }
            MeeshyButton(
                title = stringResource(R.string.profile_report_send),
                onClick = {
                    draft.submission(alreadyBlocked)?.let {
                        haptics.medium()
                        onSend(it)
                    }
                },
                kind = MeeshyButtonKind.Danger,
                width = MeeshyButtonWidth.Fill,
                enabled = draft.canSend,
            )
            MeeshyButton(
                title = stringResource(R.string.profile_report_quick_more_details),
                onClick = onMoreDetails,
                kind = MeeshyButtonKind.Text,
                width = MeeshyButtonWidth.Fill,
            )
        }
    }
}
