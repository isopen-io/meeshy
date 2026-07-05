package me.meeshy.app.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForwardIos
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.AppThemeMode
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshySpacing

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onLogout: () -> Unit,
    onOpenProfile: (String) -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.settings_title)) },
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
                .verticalScroll(rememberScrollState()),
        ) {
            SettingsSection(title = stringResource(R.string.settings_section_profile)) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(enabled = state.userId != null) {
                            state.userId?.let(onOpenProfile)
                        }
                        .semantics { role = Role.Button }
                        .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    MeeshyAvatar(
                        name = state.username ?: "?",
                        modifier = Modifier.size(48.dp),
                    )
                    Spacer(Modifier.width(MeeshySpacing.md))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = state.username ?: "",
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                        state.email?.let {
                            Text(
                                text = it,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }

            SettingsSection(title = stringResource(R.string.settings_section_appearance)) {
                ThemePickerRow(
                    label = stringResource(R.string.settings_theme),
                    selected = state.themeMode,
                    onSelect = viewModel::setThemeMode,
                )
            }

            SettingsSection(title = stringResource(R.string.settings_section_language)) {
                SettingsRow(label = stringResource(R.string.settings_display_language), detail = null, onClick = {})
                HorizontalDivider(modifier = Modifier.padding(start = MeeshySpacing.lg))
                SettingsRow(label = stringResource(R.string.settings_regional_language), detail = null, onClick = {})
            }

            SettingsSection(title = stringResource(R.string.settings_section_notifications)) {
                var pushEnabled by remember { mutableStateOf(true) }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(R.string.settings_push_notifications),
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.weight(1f),
                    )
                    Switch(
                        checked = pushEnabled,
                        onCheckedChange = { pushEnabled = it },
                    )
                }
            }

            SettingsSection(title = stringResource(R.string.settings_section_privacy)) {
                SettingsRow(label = stringResource(R.string.settings_two_factor), detail = null, onClick = {})
                HorizontalDivider(modifier = Modifier.padding(start = MeeshySpacing.lg))
                SettingsRow(label = stringResource(R.string.settings_active_sessions), detail = null, onClick = {})
                HorizontalDivider(modifier = Modifier.padding(start = MeeshySpacing.lg))
                SettingsRow(label = stringResource(R.string.settings_blocked_users), detail = null, onClick = {})
            }

            SettingsSection(title = stringResource(R.string.settings_section_data)) {
                SettingsRow(label = stringResource(R.string.settings_export_data), detail = null, onClick = {})
                HorizontalDivider(modifier = Modifier.padding(start = MeeshySpacing.lg))
                SettingsRow(label = stringResource(R.string.settings_clear_media_cache), detail = null, onClick = {})
                HorizontalDivider(modifier = Modifier.padding(start = MeeshySpacing.lg))
                SettingsRow(label = stringResource(R.string.settings_storage_used), detail = null, onClick = {})
            }

            SettingsSection(title = stringResource(R.string.settings_section_about)) {
                SettingsRow(label = stringResource(R.string.settings_version), detail = null, onClick = null)
                HorizontalDivider(modifier = Modifier.padding(start = MeeshySpacing.lg))
                SettingsRow(label = stringResource(R.string.settings_terms_of_service), detail = null, onClick = {})
                HorizontalDivider(modifier = Modifier.padding(start = MeeshySpacing.lg))
                SettingsRow(label = stringResource(R.string.settings_privacy_policy), detail = null, onClick = {})
            }

            SettingsSection(title = stringResource(R.string.settings_section_danger)) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
                    verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                ) {
                    Button(
                        onClick = onLogout,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.error,
                        ),
                    ) {
                        Text(stringResource(R.string.settings_log_out))
                    }
                    SettingsRow(
                        label = stringResource(R.string.settings_delete_account),
                        detail = null,
                        onClick = {},
                        labelColor = MaterialTheme.colorScheme.error,
                    )
                }
            }

            Spacer(Modifier.height(MeeshySpacing.xl))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ThemePickerRow(
    label: String,
    selected: AppThemeMode,
    onSelect: (AppThemeMode) -> Unit,
) {
    val options = listOf(
        AppThemeMode.AUTO to R.string.settings_theme_system,
        AppThemeMode.LIGHT to R.string.settings_theme_light,
        AppThemeMode.DARK to R.string.settings_theme_dark,
    )
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
        )
        Spacer(Modifier.height(MeeshySpacing.sm))
        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
            options.forEachIndexed { index, (mode, labelRes) ->
                SegmentedButton(
                    selected = mode == selected,
                    onClick = { onSelect(mode) },
                    shape = SegmentedButtonDefaults.itemShape(index = index, count = options.size),
                ) {
                    Text(stringResource(labelRes))
                }
            }
        }
    }
}

@Composable
private fun SettingsSection(
    title: String,
    content: @Composable () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        )
        content()
        Spacer(Modifier.height(MeeshySpacing.sm))
    }
}

@Composable
private fun SettingsRow(
    label: String,
    detail: String?,
    onClick: (() -> Unit)?,
    labelColor: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.onSurface,
) {
    val modifier = if (onClick != null) {
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .semantics { role = Role.Button }
            .padding(horizontal = MeeshySpacing.lg, vertical = 14.dp)
    } else {
        Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = 14.dp)
    }

    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = labelColor,
            modifier = Modifier.weight(1f),
        )
        if (detail != null) {
            Text(
                text = detail,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.width(MeeshySpacing.xs))
        }
        if (onClick != null) {
            Icon(
                Icons.AutoMirrored.Filled.ArrowForwardIos,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(14.dp),
            )
        }
    }
}
