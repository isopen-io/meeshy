package me.meeshy.app.profile

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.model.report.ReportRequestBuilder
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Report-a-user sheet (feature-parity §K) — port of iOS `ReportUserView`. Pure glue over
 * [ReportUserViewModel]: a radio list of [ReportReason]s, an optional details field with a live
 * counter, and a submit button. On success the screen dismisses; all decision logic lives in the
 * tested ViewModel + the pure [ReportRequestBuilder] SSOT.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportUserScreen(
    onDone: () -> Unit,
    viewModel: ReportUserViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(state.isSubmitted) {
        if (state.isSubmitted) onDone()
    }

    MeeshyBackground {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                        scrolledContainerColor = Color.Transparent,
                        titleContentColor = MeeshyTheme.tokens.textPrimary,
                        navigationIconContentColor = MeeshyTheme.tokens.textPrimary,
                    ),
                    title = {
                        Text(
                            if (viewModel.username.isBlank()) {
                                stringResource(R.string.report_title_generic)
                            } else {
                                stringResource(R.string.report_title, viewModel.username)
                            },
                        )
                    },
                    navigationIcon = {
                        IconButton(onClick = onDone) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.report_close),
                            )
                        }
                    },
                )
            },
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                Text(
                    stringResource(R.string.report_reason_header),
                    color = MeeshyTheme.tokens.textSecondary,
                )

                state.reasons.forEach { reason ->
                    ReasonRow(
                        label = reasonLabel(reason),
                        selected = reason == state.selectedReason,
                        onClick = { viewModel.selectReason(reason) },
                    )
                }

                Text(
                    stringResource(R.string.report_details_header),
                    color = MeeshyTheme.tokens.textSecondary,
                )

                OutlinedTextField(
                    value = state.details,
                    onValueChange = viewModel::onDetailsChange,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 100.dp),
                    placeholder = { Text(stringResource(R.string.report_details_placeholder)) },
                    supportingText = {
                        Text(
                            "${state.detailsCount}/${ReportRequestBuilder.MAX_DETAILS_LENGTH}",
                            modifier = Modifier.fillMaxWidth(),
                            textAlign = TextAlign.End,
                        )
                    },
                )

                if (state.hasError) {
                    Text(
                        stringResource(R.string.report_error),
                        color = MeeshyPalette.Error,
                        modifier = Modifier.fillMaxWidth(),
                        textAlign = TextAlign.Center,
                    )
                }

                Button(
                    onClick = viewModel::submit,
                    enabled = state.canSubmit,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.Error),
                ) {
                    if (state.isSubmitting) {
                        CircularProgressIndicator(
                            modifier = Modifier.padding(end = MeeshySpacing.sm),
                            strokeWidth = 2.dp,
                            color = MeeshyPalette.White,
                        )
                    }
                    Text(stringResource(R.string.report_submit))
                }
            }
        }
    }
}

@Composable
private fun ReasonRow(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(
            imageVector = if (selected) Icons.Filled.CheckCircle else Icons.Filled.RadioButtonUnchecked,
            contentDescription = null,
            tint = if (selected) MeeshyPalette.Error else MeeshyTheme.tokens.textSecondary,
        )
        Text(label, color = MeeshyTheme.tokens.textPrimary)
    }
}

@Composable
private fun reasonLabel(reason: ReportReason): String = stringResource(
    when (reason) {
        ReportReason.SPAM -> R.string.report_reason_spam
        ReportReason.HARASSMENT -> R.string.report_reason_harassment
        ReportReason.INAPPROPRIATE -> R.string.report_reason_inappropriate
        ReportReason.IMPERSONATION -> R.string.report_reason_impersonation
        // VIOLENCE / HATE_SPEECH are message-only reasons — never in the user-report
        // `ReportReason.ordered` list, so these arms are unreachable here and exist only to keep
        // the `when` exhaustive after the enum was widened for the report-a-message flow.
        ReportReason.OTHER, ReportReason.VIOLENCE, ReportReason.HATE_SPEECH -> R.string.report_reason_other
    },
)
