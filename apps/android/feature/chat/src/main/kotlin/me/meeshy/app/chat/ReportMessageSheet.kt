package me.meeshy.app.chat

import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.model.report.ReportRequestBuilder
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Report-a-message bottom sheet — port of the iOS `ReportMessageSheet`, driven entirely by the pure
 * [ReportMessageForm] state machine in [ChatViewModel]. A radio list of [ReportReason]s (the wider
 * message set), an optional details field with a live counter, and a submit button. On success the
 * sheet confirms with a toast and dismisses; every decision (details cap, submit-guard, error
 * handling) lives in the tested ViewModel + form, so this is coverage-exempt Compose glue.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportMessageSheet(
    form: ReportMessageForm,
    accentColor: Color,
    onSelectReason: (ReportReason) -> Unit,
    onDetailsChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    LaunchedEffect(form.isSubmitted) {
        if (form.isSubmitted) {
            Toast.makeText(context, context.getString(R.string.report_message_sent), Toast.LENGTH_SHORT).show()
            onDismiss()
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = MeeshySpacing.lg)
                .padding(bottom = MeeshySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Text(
                stringResource(R.string.report_message_title),
                style = MaterialTheme.typography.titleSmall,
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.padding(vertical = MeeshySpacing.sm),
            )

            form.reasons.forEach { reason ->
                ReasonRow(
                    label = reasonLabel(reason),
                    selected = reason == form.selectedReason,
                    accentColor = accentColor,
                    onClick = { onSelectReason(reason) },
                )
            }

            Text(
                stringResource(R.string.report_message_details_header),
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.padding(top = MeeshySpacing.sm),
            )

            OutlinedTextField(
                value = form.details,
                onValueChange = onDetailsChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 96.dp),
                placeholder = { Text(stringResource(R.string.report_message_details_placeholder)) },
                supportingText = {
                    Text(
                        "${form.detailsCount}/${ReportRequestBuilder.MAX_DETAILS_LENGTH}",
                        modifier = Modifier.fillMaxWidth(),
                        textAlign = TextAlign.End,
                    )
                },
            )

            if (form.hasError) {
                Text(
                    stringResource(R.string.report_message_error),
                    color = MeeshyPalette.Error,
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center,
                )
            }

            Button(
                onClick = onSubmit,
                enabled = form.canSubmit,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.Error),
            ) {
                if (form.isSubmitting) {
                    CircularProgressIndicator(
                        modifier = Modifier
                            .size(18.dp)
                            .padding(end = MeeshySpacing.sm),
                        strokeWidth = 2.dp,
                        color = MeeshyPalette.White,
                    )
                }
                Text(stringResource(R.string.report_message_submit))
            }
        }
    }
}

@Composable
private fun ReasonRow(
    label: String,
    selected: Boolean,
    accentColor: Color,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Icon(
            imageVector = if (selected) Icons.Filled.CheckCircle else Icons.Filled.RadioButtonUnchecked,
            contentDescription = null,
            tint = if (selected) accentColor else MeeshyTheme.tokens.textSecondary,
        )
        Text(label, color = MeeshyTheme.tokens.textPrimary)
    }
}

@Composable
private fun reasonLabel(reason: ReportReason): String = stringResource(
    when (reason) {
        ReportReason.SPAM -> R.string.report_reason_spam
        ReportReason.INAPPROPRIATE -> R.string.report_reason_inappropriate
        ReportReason.HARASSMENT -> R.string.report_reason_harassment
        ReportReason.VIOLENCE -> R.string.report_reason_violence
        ReportReason.HATE_SPEECH -> R.string.report_reason_hate_speech
        ReportReason.IMPERSONATION -> R.string.report_reason_impersonation
        ReportReason.OTHER -> R.string.report_reason_other
    },
)
