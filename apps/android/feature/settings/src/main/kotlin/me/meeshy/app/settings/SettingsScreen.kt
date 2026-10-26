package me.meeshy.app.settings

import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BugReport
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.HelpOutline
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.IosShare
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.PersonRemove
import androidx.compose.material.icons.filled.PrivacyTip
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.SupportAgent
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.filled.Vibration
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material.icons.filled.Build
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
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
import me.meeshy.sdk.model.AppLanguage
import me.meeshy.sdk.model.AppThemeMode
import me.meeshy.ui.component.LanguagePickerDialog
import me.meeshy.ui.component.LanguagePickerOption
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.settings.SettingsCard
import me.meeshy.ui.component.settings.SettingsRow
import me.meeshy.ui.component.settings.SettingsSectionHeader
import me.meeshy.ui.component.settings.SettingsSeparator
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Réglages (iOS `SettingsView`) : carte profil, Compte, Apparence, Notifications, Données,
 * Outils, Aide, À propos, puis Déconnexion — dans l'ordre d'iOS, chaque rangée agissant et
 * persistant son effet. Les écarts restants (profil vocal, transcription, packs, statistiques,
 * progression, parrainage, changement de compte, interrupteurs d'interface) sont des issues.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onLogout: () -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenStarred: () -> Unit = {},
    onOpenSaved: () -> Unit = {},
    onOpenShareLinks: () -> Unit = {},
    onOpenSecurity: () -> Unit = {},
    onOpenNotificationSettings: () -> Unit = {},
    onOpenAutoDownload: () -> Unit = {},
    onOpenMediaCache: () -> Unit = {},
    onOpenPrivacy: () -> Unit = {},
    onOpenBlockedUsers: () -> Unit = {},
    onOpenDataExport: () -> Unit = {},
    onOpenDiagnostics: () -> Unit = {},
    onOpenAbout: () -> Unit = {},
    onOpenSupport: () -> Unit = {},
    onOpenLicenses: () -> Unit = {},
    onOpenTerms: () -> Unit = {},
    onOpenPrivacyPolicy: () -> Unit = {},
    onOpenDeleteAccount: () -> Unit = {},
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val appVersion = rememberAppVersionName()
    val haptics = rememberMeeshyHaptics()
    var confirmLogout by remember { mutableStateOf(false) }

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
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xl),
            ) {
                ProfileCard(state = state, onOpenProfile = onOpenProfile)
                AccountSection(
                    onOpenPrivacy = onOpenPrivacy,
                    onOpenSecurity = onOpenSecurity,
                    onOpenBlockedUsers = onOpenBlockedUsers,
                    onOpenDeleteAccount = onOpenDeleteAccount,
                )
                AppearanceSection(state = state, viewModel = viewModel)
                NotificationsSection(
                    state = state,
                    viewModel = viewModel,
                    onOpenNotificationSettings = onOpenNotificationSettings,
                )
                DataSection(
                    onOpenMediaCache = onOpenMediaCache,
                    onOpenAutoDownload = onOpenAutoDownload,
                    onOpenDataExport = onOpenDataExport,
                )
                ToolsSection(
                    onOpenStarred = onOpenStarred,
                    onOpenSaved = onOpenSaved,
                    onOpenShareLinks = onOpenShareLinks,
                )
                SettingsGroup(
                    title = stringResource(R.string.settings_section_help),
                    icon = Icons.Filled.HelpOutline,
                    tint = MeeshyPalette.Success,
                ) {
                    SettingsChevronRow(
                        Icons.Filled.SupportAgent,
                        stringResource(R.string.settings_help_center),
                        MeeshyPalette.Success,
                        onOpenSupport,
                    )
                }
                AboutSection(
                    appVersion = appVersion,
                    onOpenAbout = onOpenAbout,
                    onOpenTerms = onOpenTerms,
                    onOpenPrivacyPolicy = onOpenPrivacyPolicy,
                    onOpenLicenses = onOpenLicenses,
                    onOpenDiagnostics = onOpenDiagnostics,
                )
                LogoutButton(
                    onClick = {
                        haptics.heavy()
                        confirmLogout = true
                    },
                )
                Spacer(Modifier.height(MeeshySpacing.xl))
            }
        }
    }

    if (confirmLogout) {
        LogoutConfirmation(
            onConfirm = {
                confirmLogout = false
                onLogout()
            },
            onDismiss = { confirmLogout = false },
        )
    }
}

@Composable
private fun SettingsGroup(
    title: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    tint: Color,
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        SettingsSectionHeader(title = title, icon = icon, color = tint)
        SettingsCard(tint = tint, content = content)
    }
}

@Composable
private fun ProfileCard(state: SettingsUiState, onOpenProfile: (String) -> Unit) {
    val haptics = rememberMeeshyHaptics()
    SettingsCard(tint = MeeshyPalette.Indigo500) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(enabled = state.userId != null) {
                    haptics.light()
                    state.userId?.let(onOpenProfile)
                }
                .semantics { role = Role.Button }
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MeeshyAvatar(
                name = state.profileTitle.ifEmpty { "?" },
                imageUrl = state.avatar,
                modifier = Modifier.size(48.dp),
            )
            Spacer(Modifier.width(MeeshySpacing.md))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = state.profileTitle,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                state.profileHandle?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyTheme.tokens.textSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = MeeshyTheme.tokens.textMuted,
            )
        }
    }
}

@Composable
private fun AccountSection(
    onOpenPrivacy: () -> Unit,
    onOpenSecurity: () -> Unit,
    onOpenBlockedUsers: () -> Unit,
    onOpenDeleteAccount: () -> Unit,
) {
    val tint = MeeshyPalette.TrackingAccent
    SettingsGroup(stringResource(R.string.settings_section_account), Icons.Filled.AccountCircle, tint) {
        SettingsChevronRow(Icons.Filled.Lock, stringResource(R.string.settings_privacy_title), MeeshyPalette.Indigo500, onOpenPrivacy)
        SettingsSeparator(tint)
        SettingsChevronRow(Icons.Filled.Shield, stringResource(R.string.settings_security), MeeshyPalette.Info, onOpenSecurity)
        SettingsSeparator(tint)
        SettingsChevronRow(Icons.Filled.Block, stringResource(R.string.settings_blocked_users), MeeshyPalette.Error, onOpenBlockedUsers)
        SettingsSeparator(tint)
        SettingsChevronRow(
            icon = Icons.Filled.PersonRemove,
            title = stringResource(R.string.settings_delete_account),
            color = MeeshyPalette.Error,
            onClick = onOpenDeleteAccount,
            heavyHaptic = true,
            chevronTint = MeeshyPalette.Error.copy(alpha = 0.6f),
        )
    }
}

@Composable
private fun AppearanceSection(state: SettingsUiState, viewModel: SettingsViewModel) {
    val tint = MeeshyPalette.Warning
    SettingsGroup(stringResource(R.string.settings_section_appearance), Icons.Filled.Palette, tint) {
        ThemePickerRow(
            label = stringResource(R.string.settings_theme),
            selected = state.themeMode,
            onSelect = viewModel::setThemeMode,
        )
        SettingsSeparator(tint)
        InterfaceLanguageRow(
            label = stringResource(R.string.settings_interface_language),
            selected = state.interfaceLanguage,
            onSelect = viewModel::setInterfaceLanguage,
        )
        SettingsSeparator(tint)
        RegionalLanguageRow(
            label = stringResource(R.string.settings_regional_language),
            regionalLanguage = state.regionalLanguage,
            systemLanguage = state.systemLanguage,
            query = state.regionalLanguageQuery,
            onQueryChange = viewModel::setRegionalLanguageQuery,
            onSelect = viewModel::setRegionalLanguage,
        )
    }
}

@Composable
private fun NotificationsSection(
    state: SettingsUiState,
    viewModel: SettingsViewModel,
    onOpenNotificationSettings: () -> Unit,
) {
    val tint = MeeshyPalette.Error
    val notifications = state.notifications
    SettingsGroup(stringResource(R.string.settings_section_notifications), Icons.Filled.Notifications, tint) {
        PushNotificationToggle(
            pushEnabled = notifications.pushEnabled,
            onSetPushEnabled = viewModel::setPushEnabled,
        )
        SettingsSeparator(tint)
        NotificationToggleRow(
            label = stringResource(R.string.settings_notif_sounds),
            checked = notifications.soundEnabled,
            enabled = notifications.pushEnabled,
            onCheckedChange = viewModel::setSoundEnabled,
            icon = Icons.Filled.VolumeUp,
            color = MeeshyPalette.Indigo300,
        )
        SettingsSeparator(tint)
        NotificationToggleRow(
            label = stringResource(R.string.settings_notif_vibrations),
            checked = notifications.vibrationEnabled,
            enabled = notifications.pushEnabled,
            onCheckedChange = viewModel::setVibrationEnabled,
            icon = Icons.Filled.Vibration,
            color = MeeshyPalette.TrackingAccent,
        )
        SettingsSeparator(tint)
        SettingsChevronRow(
            Icons.Filled.Tune,
            stringResource(R.string.settings_notif_more_options),
            MeeshyPalette.Error,
            onOpenNotificationSettings,
        )
    }
}

@Composable
private fun DataSection(
    onOpenMediaCache: () -> Unit,
    onOpenAutoDownload: () -> Unit,
    onOpenDataExport: () -> Unit,
) {
    val tint = MeeshyPalette.Warning
    SettingsGroup(stringResource(R.string.settings_section_data), Icons.Filled.Storage, tint) {
        SettingsChevronRow(Icons.Filled.Storage, stringResource(R.string.settings_storage), tint, onOpenMediaCache)
        SettingsSeparator(tint)
        SettingsChevronRow(Icons.Filled.Download, stringResource(R.string.settings_media_download), tint, onOpenAutoDownload)
        SettingsSeparator(tint)
        SettingsChevronRow(Icons.Filled.IosShare, stringResource(R.string.settings_export_data), tint, onOpenDataExport)
    }
}

@Composable
private fun ToolsSection(
    onOpenStarred: () -> Unit,
    onOpenSaved: () -> Unit,
    onOpenShareLinks: () -> Unit,
) {
    val tint = MeeshyPalette.Success
    SettingsGroup(stringResource(R.string.settings_section_tools), Icons.Filled.Build, tint) {
        SettingsChevronRow(Icons.Filled.Star, stringResource(R.string.settings_starred_messages), MeeshyPalette.Warning, onOpenStarred)
        SettingsSeparator(tint)
        SettingsChevronRow(Icons.Filled.Bookmark, stringResource(R.string.settings_saved_posts), MeeshyPalette.Indigo400, onOpenSaved)
        SettingsSeparator(tint)
        SettingsChevronRow(Icons.Filled.Link, stringResource(R.string.settings_share_links), tint, onOpenShareLinks)
    }
}

@Composable
private fun AboutSection(
    appVersion: String,
    onOpenAbout: () -> Unit,
    onOpenTerms: () -> Unit,
    onOpenPrivacyPolicy: () -> Unit,
    onOpenLicenses: () -> Unit,
    onOpenDiagnostics: () -> Unit,
) {
    val tint = MeeshyPalette.Info
    SettingsGroup(stringResource(R.string.settings_section_about), Icons.Filled.Info, tint) {
        SettingsChevronRow(Icons.Filled.Info, stringResource(R.string.settings_about_meeshy), tint, onOpenAbout)
        SettingsSeparator(tint)
        SettingsChevronRow(Icons.Filled.Description, stringResource(R.string.settings_terms_of_service), tint, onOpenTerms)
        SettingsSeparator(tint)
        SettingsChevronRow(Icons.Filled.PrivacyTip, stringResource(R.string.settings_privacy_policy), tint, onOpenPrivacyPolicy)
        SettingsSeparator(tint)
        SettingsChevronRow(Icons.Filled.Verified, stringResource(R.string.settings_open_source_licenses), tint, onOpenLicenses)
        SettingsSeparator(tint)
        SettingsChevronRow(Icons.Filled.BugReport, stringResource(R.string.settings_diagnostics), tint, onOpenDiagnostics)
        SettingsSeparator(tint)
        SettingsRow(
            icon = Icons.Filled.AutoAwesome,
            title = stringResource(R.string.settings_version_label),
            color = MeeshyPalette.Warning,
            value = appVersion,
            trailing = {
                Text(
                    text = appVersion,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = MeeshyTheme.tokens.textSecondary,
                )
            },
        )
    }
}

@Composable
private fun LogoutButton(onClick: () -> Unit) {
    val error = MeeshyPalette.Error
    val shape = RoundedCornerShape(MeeshyRadius.xxl)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .clickable(role = Role.Button, onClick = onClick)
            .background(error.copy(alpha = 0.1f))
            .padding(vertical = MeeshySpacing.md),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null, tint = error)
        Spacer(Modifier.width(MeeshySpacing.sm))
        Text(
            text = stringResource(R.string.settings_log_out),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            color = error,
        )
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
        icon = Icons.Filled.Translate,
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
        icon = Icons.Filled.Language,
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

/** iOS `SettingsView` : alerte « Déconnexion » avant de fermer la session, bouton destructif. */
@Composable
private fun LogoutConfirmation(onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.settings_logout_confirm_title)) },
        text = { Text(stringResource(R.string.settings_logout_confirm_message)) },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(stringResource(R.string.settings_log_out), color = MeeshyPalette.Error)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(android.R.string.cancel)) }
        },
    )
}
