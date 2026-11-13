package me.meeshy.app.settings

import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.AppLanguage
import me.meeshy.sdk.model.AppThemeMode
import me.meeshy.sdk.model.settings.SettingsHubRow
import me.meeshy.sdk.model.settings.SettingsHubRowId
import me.meeshy.ui.component.LanguagePickerDialog
import me.meeshy.ui.component.LanguagePickerOption
import me.meeshy.ui.component.settings.SettingsSeparator
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/** Apparence (iOS `appearanceSection`) : thème, langue d'interface, langue régionale (ajout Android du Prisme), interrupteurs d'interface. */
@Composable
internal fun SettingsAppearanceSection(
    rows: List<SettingsHubRow>,
    state: SettingsUiState,
    viewModel: SettingsViewModel,
) {
    val tint = MeeshyPalette.Warning
    SettingsGroup(
        stringResource(R.string.settings_section_appearance),
        MeeshyIcons.Palette,
        tint,
        orientation = stringResource(R.string.settings_languages_orientation),
    ) {
        SettingsRows(rows, tint, separatedBefore = { it.id != SettingsHubRowId.INTERFACE_FEATURES }) { row ->
            when (row.id) {
                SettingsHubRowId.THEME -> ThemePickerRow(
                    label = stringResource(R.string.settings_theme),
                    selected = state.themeMode,
                    onSelect = viewModel::setThemeMode,
                )
                SettingsHubRowId.INTERFACE_LANGUAGE -> InterfaceLanguageRow(
                    label = stringResource(R.string.settings_interface_language),
                    selected = state.interfaceLanguage,
                    onSelect = viewModel::setInterfaceLanguage,
                )
                SettingsHubRowId.REGIONAL_LANGUAGE -> RegionalLanguageRow(
                    label = stringResource(R.string.settings_regional_language),
                    regionalLanguage = state.regionalLanguage,
                    systemLanguage = state.systemLanguage,
                    query = state.regionalLanguageQuery,
                    onQueryChange = viewModel::setRegionalLanguageQuery,
                    onSelect = viewModel::setRegionalLanguage,
                )
                SettingsHubRowId.INTERFACE_FEATURES -> InterfaceFeatureRows(separatorTint = tint)
                else -> Unit
            }
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
    val haptics = rememberMeeshyHaptics()
    val options = listOf(
        AppThemeMode.AUTO to R.string.settings_theme_system,
        AppThemeMode.LIGHT to R.string.settings_theme_light,
        AppThemeMode.DARK to R.string.settings_theme_dark,
    )
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Medium,
        )
        Spacer(Modifier.height(MeeshySpacing.sm))
        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
            options.forEachIndexed { index, (mode, labelRes) ->
                SegmentedButton(
                    selected = mode == selected,
                    onClick = {
                        haptics.light()
                        onSelect(mode)
                    },
                    shape = SegmentedButtonDefaults.itemShape(index = index, count = options.size),
                ) {
                    Text(stringResource(labelRes))
                }
            }
        }
    }
}

@Composable
private fun InterfaceLanguageRow(
    label: String,
    selected: String?,
    onSelect: (String?) -> Unit,
) {
    var showDialog by remember { mutableStateOf(false) }
    val systemLabel = stringResource(R.string.settings_interface_language_automatic)
    val detail = selected?.let { AppLanguage.info(it)?.nativeName } ?: systemLabel

    SettingsChevronRow(
        icon = MeeshyIcons.Translate,
        title = label,
        color = MeeshyPalette.Indigo600,
        value = detail,
        onClick = { showDialog = true },
    )

    if (showDialog) {
        InterfaceLanguageDialog(
            selected = selected,
            systemLabel = systemLabel,
            onSelect = {
                onSelect(it)
                showDialog = false
            },
            onDismiss = { showDialog = false },
        )
    }
}

@Composable
private fun InterfaceLanguageDialog(
    selected: String?,
    systemLabel: String,
    onSelect: (String?) -> Unit,
    onDismiss: () -> Unit,
) {
    val options = buildList {
        add(LanguagePickerOption(code = null, label = systemLabel, isSelected = selected == null))
        AppLanguage.supportedLanguages.forEach { language ->
            add(
                LanguagePickerOption(
                    code = language.code,
                    label = "${language.flag}  ${language.nativeName}",
                    isSelected = selected == language.code,
                ),
            )
        }
    }
    LanguagePickerDialog(
        titleText = stringResource(R.string.settings_display_language),
        options = options,
        onSelect = onSelect,
        onDismiss = onDismiss,
        dismissButtonLabel = stringResource(R.string.settings_language_dialog_close),
    )
}

@Composable
private fun RegionalLanguageRow(
    label: String,
    regionalLanguage: String?,
    systemLanguage: String?,
    query: String,
    onQueryChange: (String) -> Unit,
    onSelect: (String) -> Unit,
) {
    var showDialog by remember { mutableStateOf(false) }
    val presentation = RegionalLanguageSelection.build(regionalLanguage, systemLanguage, query)
    val detail = presentation.selectedLabel ?: stringResource(R.string.settings_regional_language_none)

    SettingsChevronRow(
        icon = MeeshyIcons.Language,
        title = label,
        color = MeeshyPalette.Success,
        value = detail,
        onClick = {
            onQueryChange("")
            showDialog = true
        },
    )

    if (showDialog) {
        RegionalLanguageDialog(
            options = presentation.options,
            query = query,
            onQueryChange = onQueryChange,
            onSelect = {
                onSelect(it)
                showDialog = false
            },
            onDismiss = { showDialog = false },
        )
    }
}

@Composable
private fun RegionalLanguageDialog(
    options: List<RegionalLanguageOption>,
    query: String,
    onQueryChange: (String) -> Unit,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    LanguagePickerDialog(
        titleText = stringResource(R.string.settings_regional_language),
        options = options.map {
            LanguagePickerOption(code = it.code, label = "${it.flag}  ${it.nativeName}", isSelected = it.isSelected)
        },
        onSelect = { code -> code?.let(onSelect) },
        onDismiss = onDismiss,
        dismissButtonLabel = stringResource(R.string.settings_language_dialog_close),
        searchQuery = query,
        onSearchQueryChange = onQueryChange,
        searchPlaceholder = stringResource(R.string.settings_regional_language_search),
        emptyStateText = stringResource(R.string.settings_regional_language_empty),
    )
}

