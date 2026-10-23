package me.meeshy.app.navigation.graph

import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import me.meeshy.app.auth.AuthViewModel
import me.meeshy.app.navigation.Routes
import me.meeshy.app.settings.AboutScreen
import me.meeshy.app.settings.AccountDeletionScreen
import me.meeshy.app.settings.ActiveSessionsScreen
import me.meeshy.app.settings.ChangePasswordScreen
import me.meeshy.app.settings.CrashReportScreen
import me.meeshy.app.settings.DataExportScreen
import me.meeshy.app.settings.LegalDocumentScreen
import me.meeshy.app.settings.LicensesScreen
import me.meeshy.app.settings.MediaCacheScreen
import me.meeshy.app.settings.MediaDownloadScreen
import me.meeshy.app.settings.PrivacySettingsScreen
import me.meeshy.app.settings.SecurityScreen
import me.meeshy.app.settings.SettingsScreen
import me.meeshy.app.settings.SupportScreen
import me.meeshy.app.settings.TwoFactorScreen
import me.meeshy.sdk.model.legal.LegalDocumentKind

/** Hub Reglages et tous ses sous-ecrans. */
internal fun NavGraphBuilder.settingsNavGraph(
    navController: NavHostController,
    authViewModel: AuthViewModel,
) {
    composable(Routes.SETTINGS) {
        SettingsScreen(
            onBack = { navController.popBackStack() },
            onLogout = {
                authViewModel.logout()
                navController.navigate(Routes.LOGIN) {
                    popUpTo(Routes.CONVERSATIONS) { inclusive = true }
                }
            },
            onOpenProfile = { userId -> navController.navigate(Routes.profile(userId)) },
            onOpenStarred = { navController.navigate(Routes.STARRED) },
            onOpenSaved = { navController.navigate(Routes.SAVED_POSTS) },
            onOpenShareLinks = { navController.navigate(Routes.MY_SHARE_LINKS) },
            onOpenChangePassword = { navController.navigate(Routes.CHANGE_PASSWORD) },
            onOpenTwoFactor = { navController.navigate(Routes.TWO_FACTOR) },
            onOpenAccountContact = { navController.navigate(Routes.SECURITY) },
            onOpenAutoDownload = { navController.navigate(Routes.MEDIA_DOWNLOAD) },
            onOpenMediaCache = { navController.navigate(Routes.MEDIA_CACHE) },
            onOpenPrivacy = { navController.navigate(Routes.PRIVACY) },
            onOpenActiveSessions = { navController.navigate(Routes.ACTIVE_SESSIONS) },
            onOpenBlockedUsers = { navController.navigate(Routes.BLOCKED_USERS) },
            onOpenDataExport = { navController.navigate(Routes.DATA_EXPORT) },
            onOpenDiagnostics = { navController.navigate(Routes.DIAGNOSTICS) },
            onOpenAbout = { navController.navigate(Routes.ABOUT) },
            onOpenSupport = { navController.navigate(Routes.SUPPORT) },
            onOpenLicenses = { navController.navigate(Routes.LICENSES) },
            onOpenTerms = {
                navController.navigate(Routes.legal(LegalDocumentKind.TERMS_OF_SERVICE))
            },
            onOpenPrivacyPolicy = {
                navController.navigate(Routes.legal(LegalDocumentKind.PRIVACY_POLICY))
            },
            onOpenDeleteAccount = { navController.navigate(Routes.DELETE_ACCOUNT) },
        )
    }
    composable(Routes.CHANGE_PASSWORD) {
        ChangePasswordScreen(onBack = { navController.popBackStack() })
    }
    composable(
        route = "${Routes.TWO_FACTOR}?step={step}",
        arguments = listOf(
            navArgument("step") {
                type = NavType.StringType
                nullable = true
                defaultValue = null
            },
        ),
    ) { backStackEntry ->
        TwoFactorScreen(
            onBack = { navController.popBackStack() },
            startStep = backStackEntry.arguments?.getString("step"),
        )
    }
    composable(Routes.SECURITY) { SecurityRoute(navController) }
    composable(Routes.ACCOUNT_CONTACT) { SecurityRoute(navController) }
    composable(Routes.DELETE_ACCOUNT) {
        AccountDeletionScreen(onBack = { navController.popBackStack() })
    }
    composable(Routes.MEDIA_DOWNLOAD) {
        MediaDownloadScreen(onBack = { navController.popBackStack() })
    }
    composable(Routes.MEDIA_CACHE) {
        MediaCacheScreen(onBack = { navController.popBackStack() })
    }
    composable(Routes.DATA_EXPORT) {
        DataExportScreen(onBack = { navController.popBackStack() })
    }
    composable(Routes.DIAGNOSTICS) {
        CrashReportScreen(onBack = { navController.popBackStack() })
    }
    composable(Routes.ABOUT) {
        AboutScreen(onBack = { navController.popBackStack() })
    }
    composable(Routes.SUPPORT) {
        SupportScreen(onBack = { navController.popBackStack() })
    }
    composable(Routes.LICENSES) {
        LicensesScreen(onBack = { navController.popBackStack() })
    }
    composable(
        route = Routes.LEGAL,
        arguments = listOf(navArgument(Routes.LEGAL_DOC_ARG) { type = NavType.StringType }),
    ) { backStackEntry ->
        val kind = LegalDocumentKind.fromArg(
            backStackEntry.arguments?.getString(Routes.LEGAL_DOC_ARG),
        ) ?: LegalDocumentKind.TERMS_OF_SERVICE
        LegalDocumentScreen(kind = kind, onBack = { navController.popBackStack() })
    }
    composable(Routes.PRIVACY) {
        PrivacySettingsScreen(onBack = { navController.popBackStack() })
    }
    composable(Routes.ACTIVE_SESSIONS) {
        ActiveSessionsScreen(onBack = { navController.popBackStack() })
    }
}

/** Page Sécurité ; l'ancienne route `settings/account-contact` y mène aussi. */
@androidx.compose.runtime.Composable
private fun SecurityRoute(navController: NavHostController) {
    SecurityScreen(
        onBack = { navController.popBackStack() },
        onOpenChangePassword = { navController.navigate(Routes.CHANGE_PASSWORD) },
        onOpenTwoFactor = { step -> navController.navigate("${Routes.TWO_FACTOR}?step=$step") },
        onOpenSessions = { navController.navigate(Routes.ACTIVE_SESSIONS) },
    )
}
