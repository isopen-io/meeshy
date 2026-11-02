package me.meeshy.app.conversations

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.model.report.ReportReasonPresentation
import me.meeshy.sdk.model.report.ReportRequestBuilder
import me.meeshy.ui.component.report.ReportDetailsField
import me.meeshy.ui.component.report.ReportReasonList
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Feuille « Signaler » d'une conversation (parité iOS `ReportMessageSheet` titrée
 * `report.conversation.title`) : les motifs d'un message, des détails facultatifs, « Envoyer »
 * teinté de l'accent de la conversation. L'envoi remonte motif + détails nettoyés ; le dépôt, la
 * session et les toasts appartiennent au [ConversationListDialogController].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ConversationReportSheet(
    accent: Color,
    onSubmit: (ReportReason, String?) -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MeeshyTheme.tokens.backgroundSecondary,
    ) {
        ConversationReportForm(accent = accent, onSubmit = onSubmit, onCancel = onDismiss)
    }
}

/** Le contenu de la feuille, sans la feuille : testable tel quel. */
@Composable
internal fun ConversationReportForm(
    accent: Color,
    onSubmit: (ReportReason, String?) -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = MeeshyTheme.tokens
    val haptics = rememberMeeshyHaptics()
    var reason by rememberSaveable { mutableStateOf(ReportReason.messageOrdered.first()) }
    var details by rememberSaveable { mutableStateOf("") }
    Column(
        modifier = modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.lg)
            .padding(bottom = MeeshySpacing.xl),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onCancel, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(stringResource(R.string.dialogs_cancel), color = tokens.textSecondary)
            }
            Text(
                text = stringResource(R.string.dialogs_report_nav_title),
                modifier = Modifier.weight(1f).semantics { heading() },
                textAlign = TextAlign.Center,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = tokens.textPrimary,
            )
            TextButton(
                onClick = { onSubmit(reason, ReportRequestBuilder.sanitizeDetails(details)) },
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(stringResource(R.string.dialogs_report_send), color = accent, fontWeight = FontWeight.SemiBold)
            }
        }
        Text(
            text = stringResource(R.string.dialogs_report_title),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            color = tokens.textPrimary,
        )
        ReportReasonList(
            reasons = ReportReasonPresentation.forMessage,
            selected = reason,
            onSelect = {
                haptics.light()
                reason = it
            },
            label = { stringResource(it.reason.dialogLabelRes()) },
        )
        Text(
            text = stringResource(R.string.dialogs_report_details_label),
            style = MaterialTheme.typography.labelMedium,
            color = tokens.textSecondary,
        )
        ReportDetailsField(
            value = details,
            onValueChange = { details = it },
            placeholder = stringResource(R.string.dialogs_report_details_placeholder),
            accessibilityLabel = stringResource(R.string.dialogs_report_details_label),
            limit = ReportRequestBuilder.MAX_DETAILS_LENGTH,
        )
    }
}

@StringRes
internal fun ReportReason.dialogLabelRes(): Int = when (this) {
    ReportReason.SPAM -> R.string.dialogs_report_reason_spam
    ReportReason.HARASSMENT -> R.string.dialogs_report_reason_harassment
    ReportReason.INAPPROPRIATE -> R.string.dialogs_report_reason_inappropriate
    ReportReason.VIOLENCE -> R.string.dialogs_report_reason_violence
    ReportReason.HATE_SPEECH -> R.string.dialogs_report_reason_hate_speech
    ReportReason.IMPERSONATION -> R.string.dialogs_report_reason_impersonation
    ReportReason.OTHER -> R.string.dialogs_report_reason_other
}
