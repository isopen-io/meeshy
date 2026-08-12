package me.meeshy.app.settings

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.IosShare
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.export.ExportArtifact
import me.meeshy.sdk.model.export.ExportFormat
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import java.io.File

/**
 * GDPR data-export screen (feature-parity §L) — port of iOS `DataExportView`. A format picker
 * (JSON/CSV), content toggles (messages/contacts; profile is always included), and an export
 * button. On success a summary card shows the counts and a Share action writes the tested
 * [ExportArtifact] to the cache dir and hands it to the Android share sheet. Pure glue over
 * [DataExportViewModel]; the query projection, file building and error mapping live in the tested
 * SSOTs. Surpasses iOS by sharing the **full** payload, not just summary counts.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DataExportScreen(
    onBack: () -> Unit,
    viewModel: DataExportViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current

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
                    title = { Text(stringResource(R.string.data_export_title)) },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.settings_back),
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
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
            ) {
                InfoCard()
                FormatSection(selected = state.format, onSelect = viewModel::setFormat)
                ContentSection(
                    includeMessages = state.includeMessages,
                    includeContacts = state.includeContacts,
                    onToggleMessages = viewModel::toggleMessages,
                    onToggleContacts = viewModel::toggleContacts,
                )

                state.error?.let { error ->
                    Text(
                        text = stringResource(error.messageRes()),
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyPalette.Error,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                Button(
                    onClick = viewModel::submit,
                    enabled = state.canSubmit,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.Indigo500),
                ) {
                    if (state.isExporting) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            color = MeeshyPalette.White,
                            strokeWidth = 2.dp,
                        )
                        Spacer(Modifier.size(MeeshySpacing.sm))
                    }
                    Text(stringResource(R.string.data_export_button))
                }

                state.artifact?.let { artifact ->
                    ExportReadyCard(
                        messagesCount = state.messagesCount,
                        contactsCount = state.contactsCount,
                        onShare = { shareArtifact(context, artifact) },
                    )
                }

                Spacer(Modifier.height(MeeshySpacing.xl))
            }
        }
    }
}

@Composable
private fun InfoCard() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                MeeshyPalette.Indigo500.copy(alpha = 0.08f),
                RoundedCornerShape(MeeshySpacing.md),
            )
            .border(
                1.dp,
                MeeshyPalette.Indigo500.copy(alpha = 0.3f),
                RoundedCornerShape(MeeshySpacing.md),
            )
            .padding(MeeshySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Shield, contentDescription = null, tint = MeeshyPalette.Indigo500)
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            Text(
                text = stringResource(R.string.data_export_info_title),
                style = MaterialTheme.typography.titleSmall,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Text(
                text = stringResource(R.string.data_export_info_body),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

@Composable
private fun FormatSection(selected: ExportFormat, onSelect: (ExportFormat) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        SectionLabel(stringResource(R.string.data_export_section_format))
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            ExportFormat.ordered.forEach { format ->
                val isSelected = format == selected
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .background(
                            if (isSelected) MeeshyPalette.Indigo500 else MeeshyPalette.Indigo500.copy(alpha = 0.10f),
                            RoundedCornerShape(MeeshySpacing.md),
                        )
                        .selectable(
                            selected = isSelected,
                            role = Role.RadioButton,
                            onClick = { onSelect(format) },
                        )
                        .padding(vertical = MeeshySpacing.md),
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Text(
                        text = stringResource(format.labelRes()),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = if (isSelected) MeeshyPalette.White else MeeshyPalette.Indigo500,
                    )
                }
            }
        }
    }
}

@Composable
private fun ContentSection(
    includeMessages: Boolean,
    includeContacts: Boolean,
    onToggleMessages: () -> Unit,
    onToggleContacts: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        SectionLabel(stringResource(R.string.data_export_section_content))
        ToggleRow(
            label = stringResource(R.string.data_export_content_profile),
            checked = true,
            enabled = false,
            onToggle = {},
        )
        ToggleRow(
            label = stringResource(R.string.data_export_content_messages),
            checked = includeMessages,
            enabled = true,
            onToggle = onToggleMessages,
        )
        ToggleRow(
            label = stringResource(R.string.data_export_content_contacts),
            checked = includeContacts,
            enabled = true,
            onToggle = onToggleContacts,
        )
    }
}

@Composable
private fun ToggleRow(label: String, checked: Boolean, enabled: Boolean, onToggle: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = if (enabled) MeeshyTheme.tokens.textPrimary else MeeshyTheme.tokens.textSecondary,
        )
        Switch(checked = checked, enabled = enabled, onCheckedChange = { onToggle() })
    }
}

@Composable
private fun ExportReadyCard(messagesCount: Int?, contactsCount: Int?, onShare: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                MeeshyPalette.Success.copy(alpha = 0.10f),
                RoundedCornerShape(MeeshySpacing.md),
            )
            .padding(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = MeeshyPalette.Success)
            Text(
                text = stringResource(R.string.data_export_ready_title),
                style = MaterialTheme.typography.titleSmall,
                color = MeeshyTheme.tokens.textPrimary,
            )
        }
        messagesCount?.let {
            Text(
                text = stringResource(R.string.data_export_ready_messages, it),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
        contactsCount?.let {
            Text(
                text = stringResource(R.string.data_export_ready_contacts, it),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
        OutlinedButton(
            onClick = onShare,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Icon(Icons.Filled.IosShare, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.size(MeeshySpacing.sm))
            Text(stringResource(R.string.data_export_share))
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.SemiBold,
        color = MeeshyTheme.tokens.textSecondary,
    )
}

/**
 * Writes the artifact to `cacheDir/exports/<fileName>` and launches the share sheet with a
 * FileProvider content URI (authority `${applicationId}.fileprovider`). Pure I/O glue, exempt
 * from the coverage gate.
 */
private fun shareArtifact(context: Context, artifact: ExportArtifact) {
    val dir = File(context.cacheDir, "exports").apply { mkdirs() }
    val file = File(dir, artifact.fileName)
    file.writeText(artifact.content)
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = artifact.mimeType
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(
        Intent.createChooser(intent, context.getString(R.string.data_export_share)),
    )
}

private fun ExportFormat.labelRes(): Int = when (this) {
    ExportFormat.JSON -> R.string.data_export_format_json
    ExportFormat.CSV -> R.string.data_export_format_csv
}

private fun DataExportError.messageRes(): Int = when (this) {
    DataExportError.NETWORK -> R.string.data_export_error_network
    DataExportError.GENERIC -> R.string.data_export_error_generic
}
