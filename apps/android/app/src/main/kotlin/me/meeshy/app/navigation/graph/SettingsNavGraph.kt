package me.meeshy.app.navigation.graph

import me.meeshy.app.navigation.popFrom
import me.meeshy.app.navigation.pushFrom
import androidx.compose.animation.AnimatedContentScope
import androidx.compose.runtime.Composable
import androidx.navigation.NamedNavArgument
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import me.meeshy.app.navigation.sheetComposable
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import me.meeshy.app.BuildConfig
import me.meeshy.app.auth.AuthViewModel
import me.meeshy.app.navigation.ProfileRoutes
import me.meeshy.app.navigation.Routes
import me.meeshy.app.settings.AboutScreen
import me.meeshy.app.settings.AccountDeletionScreen
import me.meeshy.app.settings.ActiveSessionsScreen
import me.meeshy.app.settings.ChangePasswordScreen
import me.meeshy.app.settings.CrashReportScreen
import me.meeshy.app.settings.DataExportScreen
import me.meeshy.app.settings.EncryptedDevicesScreen
import me.meeshy.app.settings.LegalDocumentScreen
import me.meeshy.app.settings.LicensesScreen
import me.meeshy.app.settings.DataStorageScreen
import me.meeshy.app.settings.MediaDownloadScreen
import me.meeshy.app.settings.NotificationSettingsScreen
import me.meeshy.app.settings.PackShopScreen
import me.meeshy.app.settings.PrivacySettingsScreen
import me.meeshy.app.settings.SecurityScreen
import me.meeshy.app.settings.SettingsScreen
import me.meeshy.app.settings.SupportScreen
import me.meeshy.app.settings.TwoFactorScreen
import me.meeshy.sdk.model.legal.LegalDocumentKind
import me.meeshy.sdk.model.settings.SettingsHubSectionId
import me.meeshy.sdk.model.settings.SettingsInvite

/** Hub Reglages et tous ses sous-ecrans. */
internal fun NavGraphBuilder.settingsNavGraph(
    navController: NavHostController,
    authViewModel: AuthViewModel,
) {
    settingsComposable(Routes.SETTINGS) { entry -> SettingsHub(navController, entry, authViewModel, focus = null) }
    settingsComposable(
        Routes.SETTINGS_FOCUS,
        arguments = listOf(navArgument(Routes.SETTINGS_FOCUS_ARG) { type = NavType.StringType }),
    ) { entry ->
        val invite = SettingsInvite.fromWire(entry.arguments?.getString(Routes.SETTINGS_FOCUS_ARG))
        SettingsHub(navController, entry, authViewModel, focus = invite?.section)
    }
    sheetComposable(Routes.NOTIFICATION_SETTINGS, navController) { _, dismiss ->
        NotificationSettingsScreen(onBack = dismiss)
    }
    sheetComposable(Routes.CHANGE_PASSWORD, navController) { _, dismiss ->
        ChangePasswordScreen(onBack = dismiss)
    }
    sheetComposable(
        route = "${Routes.TWO_FACTOR}?step={step}",
        navController = navController,
        arguments = listOf(
            navArgument("step") {
                type = NavType.StringType
                nullable = true
                defaultValue = null
            },
        ),
    ) { backStackEntry, dismiss ->
        TwoFactorScreen(
            onBack = dismiss,
            startStep = backStackEntry.arguments?.getString("step"),
        )
    }
    sheetComposable(Routes.SECURITY, navController) { entry, dismiss -> SecurityRoute(navController, entry, dismiss) }
    sheetComposable(Routes.ACCOUNT_CONTACT, navController) { entry, dismiss -> SecurityRoute(navController, entry, dismiss) }
    sheetComposable(Routes.DELETE_ACCOUNT, navController) { _, dismiss ->
        AccountDeletionScreen(onBack = dismiss)
    }
    sheetComposable(Routes.MEDIA_DOWNLOAD, navController) { _, dismiss ->
        MediaDownloadScreen(onBack = dismiss)
    }
    sheetComposable(Routes.MEDIA_CACHE, navController) { _, dismiss ->
        DataStorageScreen(onBack = dismiss)
    }
    sheetComposable(
        route = "${Routes.PACK_SHOP}?domain={domain}&pack={pack}",
        navController = navController,
        arguments = listOf(
            navArgument("domain") { type = NavType.StringType; nullable = true; defaultValue = null },
            navArgument("pack") { type = NavType.StringType; nullable = true; defaultValue = null },
        ),
        deepLinks = listOf(navDeepLink { uriPattern = Routes.PACK_SHOP_DEEP_LINK }),
    ) { _, dismiss ->
        PackShopScreen(onBack = dismiss)
    }
    sheetComposable(Routes.DATA_EXPORT, navController) { _, dismiss ->
        DataExportScreen(onBack = dismiss)
    }
    sheetComposable(Routes.DIAGNOSTICS, navController) { _, dismiss ->
        CrashReportScreen(onBack = dismiss)
    }
    sheetComposable(Routes.ABOUT, navController) { _, dismiss ->
        AboutScreen(onBack = dismiss)
    }
    sheetComposable(Routes.SUPPORT, navController) { _, dismiss ->
        SupportScreen(onBack = dismiss)
    }
    sheetComposable(Routes.LICENSES, navController) { _, dismiss ->
        LicensesScreen(onBack = dismiss, sourceCommit = BuildConfig.SOURCE_COMMIT)
    }
    sheetComposable(
        route = Routes.LEGAL,
        navController = navController,
        arguments = listOf(navArgument(Routes.LEGAL_DOC_ARG) { type = NavType.StringType }),
    ) { backStackEntry, dismiss ->
        val kind = LegalDocumentKind.fromArg(
            backStackEntry.arguments?.getString(Routes.LEGAL_DOC_ARG),
        ) ?: LegalDocumentKind.TERMS_OF_SERVICE
        LegalDocumentScreen(kind = kind, onBack = dismiss)
    }
    sheetComposable(Routes.PRIVACY, navController) { _, dismiss ->
        PrivacySettingsScreen(onBack = dismiss)
    }
    sheetComposable(Routes.ACTIVE_SESSIONS, navController) { _, dismiss ->
        ActiveSessionsScreen(onBack = dismiss)
    }
    sheetComposable(Routes.ENCRYPTED_DEVICES, navController) { _, dismiss ->
        EncryptedDevicesScreen(onBack = dismiss)
    }
}

/** Page Sécurité ; l'ancienne route `settings/account-contact` y mène aussi. */
@androidx.compose.runtime.Composable
private fun SecurityRoute(navController: NavHostController, entry: NavBackStackEntry, dismiss: () -> Unit) {
    SecurityScreen(
        onBack = dismiss,
        onOpenChangePassword = { navController.pushFrom(entry, Routes.CHANGE_PASSWORD) },
        onOpenTwoFactor = { step -> navController.pushFrom(entry, "${Routes.TWO_FACTOR}?step=$step") },
        onOpenSessions = { navController.pushFrom(entry, Routes.ACTIVE_SESSIONS) },
        onOpenEncryptedDevices = { navController.pushFrom(entry, Routes.ENCRYPTED_DEVICES) },
    )
}

/**
 * Un écran des Réglages (le hub et son invite) : empilé, il prend la poussée commune du `NavHost` (`stackEnter`…), miroitée
 * en RTL, comme tout écran poussé de l'app (#18365).
 */
private fun NavGraphBuilder.settingsComposable(
    route: String,
    arguments: List<NamedNavArgument> = emptyList(),
    content: @Composable AnimatedContentScope.(NavBackStackEntry) -> Unit,
) = composable(
    route = route,
    arguments = arguments,
    content = content,
)

/** Le hub Réglages, ouvert seul ou par une invite de réglage qui désigne la section [focus] (#16339). */
@Composable
private fun SettingsHub(
    navController: NavHostController,
    entry: NavBackStackEntry,
    authViewModel: AuthViewModel,
    focus: SettingsHubSectionId?,
) {
    SettingsScreen(
        onBack = { navController.popFrom(entry) },
        // La racine bascule sur LOGIN quand la session est fermée (startDestination) :
        // SignOutViewModel n'émet qu'après le retour de logout().
        onSignedOut = { authViewModel.onSignedOutExternally() },
        onOpenProfile = { userId -> ProfileRoutes.own(userId)?.let { navController.pushFrom(entry, it) } },
        onOpenStarred = { navController.pushFrom(entry, Routes.STARRED) },
        onOpenSaved = { navController.pushFrom(entry, Routes.SAVED_POSTS) },
        onOpenShareLinks = { navController.pushFrom(entry, Routes.MY_SHARE_LINKS) },
        onOpenProgression = { navController.pushFrom(entry, GameRoutes.PROGRESSION) },
        onOpenStats = { navController.pushFrom(entry, ProfileRoutes.STATS) },
        onOpenSecurity = { navController.pushFrom(entry, Routes.SECURITY) },
        onOpenNotificationSettings = { navController.pushFrom(entry, Routes.NOTIFICATION_SETTINGS) },
        onOpenAutoDownload = { navController.pushFrom(entry, Routes.MEDIA_DOWNLOAD) },
        onOpenMediaCache = { navController.pushFrom(entry, Routes.MEDIA_CACHE) },
        onOpenPacks = { navController.pushFrom(entry, Routes.packShop()) },
        onOpenPrivacy = { navController.pushFrom(entry, Routes.PRIVACY) },
        onOpenBlockedUsers = { navController.pushFrom(entry, Routes.BLOCKED_USERS) },
        onOpenDataExport = { navController.pushFrom(entry, Routes.DATA_EXPORT) },
        onOpenDiagnostics = { navController.pushFrom(entry, Routes.DIAGNOSTICS) },
        onOpenAbout = { navController.pushFrom(entry, Routes.ABOUT) },
        onOpenSupport = { navController.pushFrom(entry, Routes.SUPPORT) },
        onOpenLicenses = { navController.pushFrom(entry, Routes.LICENSES) },
        onOpenTerms = {
            navController.pushFrom(entry, Routes.legal(LegalDocumentKind.TERMS_OF_SERVICE))
        },
        onOpenPrivacyPolicy = {
            navController.pushFrom(entry, Routes.legal(LegalDocumentKind.PRIVACY_POLICY))
        },
        onOpenDeleteAccount = { navController.pushFrom(entry, Routes.DELETE_ACCOUNT) },
        onOpenVoiceProfile = { navController.pushFrom(entry, VoiceProfileWizardDestinations.ROUTE) },
        focus = focus,
    )
}
