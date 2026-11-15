package me.meeshy.app.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.chrome.CollapsibleHeaderMetrics
import me.meeshy.sdk.model.settings.SettingsHubCatalog
import me.meeshy.sdk.model.settings.SettingsHubSection
import me.meeshy.sdk.model.settings.SettingsHubSectionId
import me.meeshy.ui.component.chrome.CollapsibleHeader
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.sdk.model.settings.LogoutPhase
import kotlin.math.roundToInt
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first

private val BottomMargin = 40.dp

/**
 * Réglages (iOS `SettingsView`) : en-tête repliable, carte profil, puis les sections du
 * [SettingsHubCatalog] dans l'ordre d'iOS. Chaque section vit dans son fichier ; l'écran ne fait
 * que dispatcher le catalogue.
 */
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onSignedOut: () -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenStarred: () -> Unit = {},
    onOpenSaved: () -> Unit = {},
    onOpenShareLinks: () -> Unit = {},
    onOpenProgression: () -> Unit = {},
    onOpenStats: () -> Unit = {},
    onOpenSecurity: () -> Unit = {},
    onOpenNotificationSettings: () -> Unit = {},
    onOpenAutoDownload: () -> Unit = {},
    onOpenMediaCache: () -> Unit = {},
    onOpenPacks: () -> Unit = {},
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
    onOpenVoiceProfile: () -> Unit = {},
    /** #16339 — la section qu'une invite de réglage désigne : le hub y défile et la met en évidence. */
    focus: SettingsHubSectionId? = null,
    viewModel: SettingsViewModel = hiltViewModel(),
    signOutViewModel: SignOutViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val appVersion = rememberAppVersionName()
    val haptics = rememberMeeshyHaptics()
    val scrollState = rememberScrollState()
    val sections = remember { SettingsHubCatalog.sections() }
    val logoutPhase by signOutViewModel.phase.collectAsStateWithLifecycle()
    // Une invite ne met en évidence qu'UNE fois : revenir d'un sous-écran ne refait ni le défilement ni le halo.
    var focusSpent by rememberSaveable(focus) { mutableStateOf(false) }
    val activeFocus = focus.takeUnless { focusSpent }
    val focusedTop = remember(activeFocus) { mutableStateOf<Float?>(null) }
    val focusLanding = with(LocalDensity.current) { (CollapsibleHeaderMetrics.EXPANDED_HEIGHT.dp + MeeshySpacing.xl).toPx() }
    LaunchedEffect(activeFocus) {
        if (activeFocus == null) return@LaunchedEffect
        val top = snapshotFlow { focusedTop.value }.filterNotNull().first()
        scrollState.animateScrollTo((scrollState.value + top - focusLanding).roundToInt().coerceAtLeast(0))
    }
    LaunchedEffect(signOutViewModel) {
        signOutViewModel.effects.collect { if (it == SignOutEffect.SignedOut) onSignedOut() }
    }

    MeeshyBackground {
        Box(Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(scrollState)
                    .windowInsetsPadding(WindowInsets.statusBars)
                    .padding(top = CollapsibleHeaderMetrics.EXPANDED_HEIGHT.dp)
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xl),
            ) {
                SettingsProfileCard(state = state, onOpenProfile = onOpenProfile)
                sections.forEach { section ->
                    SettingsFocusFrame(
                        highlighted = section.id == activeFocus,
                        tint = MeeshyPalette.Indigo500,
                        onSettled = { focusSpent = true },
                        modifier = if (section.id != activeFocus) Modifier else Modifier.onGloballyPositioned {
                            if (focusedTop.value == null) focusedTop.value = it.positionInRoot().y
                        },
                    ) {
                    SettingsHubSectionHost(
                        section = section,
                        state = state,
                        viewModel = viewModel,
                        appVersion = appVersion,
                        onOpenStarred = onOpenStarred,
                        onOpenSaved = onOpenSaved,
                        onOpenShareLinks = onOpenShareLinks,
                        onOpenProgression = onOpenProgression,
                        onOpenStats = onOpenStats,
                        onOpenSecurity = onOpenSecurity,
                        onOpenNotificationSettings = onOpenNotificationSettings,
                        onOpenAutoDownload = onOpenAutoDownload,
                        onOpenMediaCache = onOpenMediaCache,
                        onOpenPacks = onOpenPacks,
                        onOpenPrivacy = onOpenPrivacy,
                        onOpenBlockedUsers = onOpenBlockedUsers,
                        onOpenDataExport = onOpenDataExport,
                        onOpenDiagnostics = onOpenDiagnostics,
                        onOpenAbout = onOpenAbout,
                        onOpenSupport = onOpenSupport,
                        onOpenLicenses = onOpenLicenses,
                        onOpenTerms = onOpenTerms,
                        onOpenPrivacyPolicy = onOpenPrivacyPolicy,
                        onOpenDeleteAccount = onOpenDeleteAccount,
                        onOpenVoiceProfile = onOpenVoiceProfile,
                        signOutEnabled = !logoutPhase.blocksInteraction,
                        onSignOut = {
                            haptics.heavy()
                            signOutViewModel.onEvent(SignOutEvent.Requested)
                        },
                    )
                    }
                }
                Spacer(Modifier.height(BottomMargin))
                Spacer(Modifier.windowInsetsPadding(WindowInsets.navigationBars))
            }
            SettingsCollapsingHeader(scrollState = scrollState, onBack = onBack)
        }
    }

    if (logoutPhase == LogoutPhase.Confirming) {
        SettingsLogoutConfirmation(
            onConfirm = { signOutViewModel.onEvent(SignOutEvent.Confirmed) },
            onDismiss = { signOutViewModel.onEvent(SignOutEvent.Cancelled) },
        )
    }
    SignOutOverlay(phase = logoutPhase)
}

/** L'offset de défilement n'est lu qu'ici : seul l'en-tête se recompose pendant le geste. */
@Composable
private fun SettingsCollapsingHeader(scrollState: ScrollState, onBack: () -> Unit) {
    val density = LocalDensity.current
    val offsetDp by remember(scrollState, density) {
        derivedStateOf { -with(density) { scrollState.value.toDp().value } }
    }
    CollapsibleHeader(
        title = stringResource(R.string.settings_title),
        scrollOffsetDp = offsetDp,
        modifier = Modifier.fillMaxWidth(),
        onBack = onBack,
        titleColor = MeeshyTheme.tokens.textPrimary,
        backArrowColor = MeeshyPalette.Indigo500,
        backgroundColor = MeeshyTheme.tokens.backgroundPrimary,
    )
}

@Composable
private fun SettingsHubSectionHost(
    section: SettingsHubSection,
    state: SettingsUiState,
    viewModel: SettingsViewModel,
    appVersion: String,
    onOpenStarred: () -> Unit,
    onOpenSaved: () -> Unit,
    onOpenShareLinks: () -> Unit,
    onOpenProgression: () -> Unit,
    onOpenStats: () -> Unit,
    onOpenSecurity: () -> Unit,
    onOpenNotificationSettings: () -> Unit,
    onOpenAutoDownload: () -> Unit,
    onOpenMediaCache: () -> Unit,
    onOpenPacks: () -> Unit,
    onOpenPrivacy: () -> Unit,
    onOpenBlockedUsers: () -> Unit,
    onOpenDataExport: () -> Unit,
    onOpenDiagnostics: () -> Unit,
    onOpenAbout: () -> Unit,
    onOpenSupport: () -> Unit,
    onOpenLicenses: () -> Unit,
    onOpenTerms: () -> Unit,
    onOpenPrivacyPolicy: () -> Unit,
    onOpenDeleteAccount: () -> Unit,
    onOpenVoiceProfile: () -> Unit,
    signOutEnabled: Boolean,
    onSignOut: () -> Unit,
) {
    val rows = section.rows
    when (section.id) {
        SettingsHubSectionId.ACCOUNT -> SettingsAccountSection(
            rows, onOpenPrivacy, onOpenSecurity, onOpenBlockedUsers, onOpenDeleteAccount,
        )
        SettingsHubSectionId.APPEARANCE -> SettingsAppearanceSection(rows, state, viewModel)
        SettingsHubSectionId.VOICE -> SettingsVoiceSection(rows, onOpenVoiceProfile)
        SettingsHubSectionId.TRANSCRIPTION -> TranscriptionSection()
        SettingsHubSectionId.NOTIFICATIONS -> SettingsNotificationsQuickSection(rows, onOpenNotificationSettings)
        SettingsHubSectionId.DATA -> SettingsDataSection(
            rows, onOpenMediaCache, onOpenAutoDownload, onOpenPacks, onOpenDataExport,
        )
        SettingsHubSectionId.TOOLS -> SettingsToolsSection(
            rows, onOpenStarred, onOpenSaved, onOpenProgression, onOpenStats, onOpenShareLinks,
        )
        SettingsHubSectionId.HELP -> SettingsHelpSection(rows, onOpenSupport)
        SettingsHubSectionId.ABOUT -> SettingsAboutSection(
            rows, appVersion, onOpenAbout, onOpenTerms, onOpenPrivacyPolicy, onOpenLicenses, onOpenDiagnostics,
        )
        SettingsHubSectionId.SIGN_OUT -> SettingsSignOutButton(enabled = signOutEnabled, onClick = onSignOut)
    }
}
