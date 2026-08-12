package me.meeshy.app.settings

import android.content.Intent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.BugReport
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.diagnostics.CrashDiagnostic
import me.meeshy.sdk.model.diagnostics.CrashKind
import me.meeshy.sdk.model.diagnostics.CrashSeverity
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import java.text.DateFormat
import java.util.Date

/**
 * Crash-diagnostics viewer (feature-parity §L) — the Android port of the iOS `CrashReportSheet`.
 * Lists captured incidents newest-first with a severity-coloured kind badge, a tap-to-expand details
 * pane, a share action (`ACTION_SEND` over the pure formatter's text) and a confirmed clear-all.
 * Pure glue over [CrashReportViewModel]; the classification, ordering and formatting are tested SSOTs.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CrashReportScreen(
    onBack: () -> Unit,
    viewModel: CrashReportViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var confirmClear by remember { mutableStateOf(false) }
    val shareLabel = stringResource(R.string.crash_reports_share)

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
                    title = { Text(stringResource(R.string.crash_reports_title)) },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.settings_back),
                            )
                        }
                    },
                    actions = {
                        if (!state.isEmpty) {
                            IconButton(
                                onClick = {
                                    val send = Intent(Intent.ACTION_SEND).apply {
                                        type = "text/plain"
                                        putExtra(Intent.EXTRA_TEXT, state.shareContent)
                                    }
                                    context.startActivity(Intent.createChooser(send, shareLabel))
                                },
                            ) {
                                Icon(
                                    Icons.Filled.Share,
                                    contentDescription = shareLabel,
                                    tint = MeeshyTheme.tokens.textPrimary,
                                )
                            }
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
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
            ) {
                InfoCard()

                when {
                    state.reports.isEmpty() && state.isLoading -> LoadingCard()
                    state.isEmpty -> EmptyCard()
                    else -> Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                        state.reports.forEach { report ->
                            ReportCard(report = report)
                        }
                    }
                }

                state.error?.let { error ->
                    Text(
                        text = stringResource(error.messageRes()),
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyPalette.Error,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                if (!state.isEmpty) {
                    Button(
                        onClick = { confirmClear = true },
                        enabled = state.canClear,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.ErrorStrong),
                    ) {
                        Icon(Icons.Filled.DeleteSweep, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.size(MeeshySpacing.sm))
                        Text(stringResource(R.string.crash_reports_clear_all))
                    }
                }

                Spacer(Modifier.height(MeeshySpacing.xl))
            }
        }
    }

    if (confirmClear) {
        AlertDialog(
            onDismissRequest = { confirmClear = false },
            title = { Text(stringResource(R.string.crash_reports_confirm_title)) },
            text = { Text(stringResource(R.string.crash_reports_confirm_message)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmClear = false
                        viewModel.clear()
                    },
                ) {
                    Text(stringResource(R.string.crash_reports_confirm_clear), color = MeeshyPalette.ErrorStrong)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmClear = false }) {
                    Text(stringResource(R.string.crash_reports_confirm_cancel))
                }
            },
        )
    }
}

@Composable
private fun InfoCard() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MeeshyPalette.Info.copy(alpha = 0.10f), RoundedCornerShape(MeeshySpacing.md))
            .border(1.dp, MeeshyPalette.Info.copy(alpha = 0.3f), RoundedCornerShape(MeeshySpacing.md))
            .padding(MeeshySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.BugReport, contentDescription = null, tint = MeeshyPalette.Info)
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            Text(
                text = stringResource(R.string.crash_reports_info_title),
                style = MaterialTheme.typography.titleSmall,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Text(
                text = stringResource(R.string.crash_reports_info_body),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

@Composable
private fun ReportCard(report: CrashDiagnostic) {
    var expanded by remember(report.id) { mutableStateOf(false) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MeeshyTheme.tokens.backgroundSecondary, RoundedCornerShape(MeeshySpacing.md))
            .border(1.dp, MeeshyTheme.tokens.inputBorder, RoundedCornerShape(MeeshySpacing.md))
            .clickable { expanded = !expanded }
            .padding(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            KindBadge(report.kind)
            Spacer(Modifier.weight(1f))
            Text(
                text = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT)
                    .format(Date(report.timestampMillis)),
                style = MaterialTheme.typography.labelSmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
        Text(
            text = report.summary,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = MeeshyTheme.tokens.textPrimary,
        )
        AnimatedVisibility(visible = expanded) {
            Text(
                text = report.details,
                style = MaterialTheme.typography.bodySmall,
                fontFamily = FontFamily.Monospace,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

@Composable
private fun KindBadge(kind: CrashKind) {
    val color = kind.severity.color()
    Text(
        text = stringResource(kind.labelRes()),
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.Bold,
        color = Color.White,
        modifier = Modifier
            .background(color, RoundedCornerShape(50))
            .padding(horizontal = MeeshySpacing.sm, vertical = 2.dp),
    )
}

@Composable
private fun EmptyCard() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .height(160.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            Icons.Filled.BugReport,
            contentDescription = null,
            tint = MeeshyPalette.Success,
            modifier = Modifier.size(40.dp),
        )
        Spacer(Modifier.height(MeeshySpacing.sm))
        Text(
            text = stringResource(R.string.crash_reports_empty),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun LoadingCard() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(120.dp),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator(color = MeeshyPalette.Indigo500)
    }
}

private fun CrashSeverity.color(): Color = when (this) {
    CrashSeverity.ERROR -> MeeshyPalette.Error
    CrashSeverity.WARNING -> MeeshyPalette.Warning
    CrashSeverity.INFO -> MeeshyPalette.Info
}

private fun CrashKind.labelRes(): Int = when (this) {
    CrashKind.EXCEPTION -> R.string.crash_kind_exception
    CrashKind.CRASH -> R.string.crash_kind_crash
    CrashKind.ANR -> R.string.crash_kind_anr
    CrashKind.CPU -> R.string.crash_kind_cpu
    CrashKind.DISK -> R.string.crash_kind_disk
}

private fun CrashReportError.messageRes(): Int = when (this) {
    CrashReportError.LOAD -> R.string.crash_reports_error_load
    CrashReportError.CLEAR -> R.string.crash_reports_error_clear
}
