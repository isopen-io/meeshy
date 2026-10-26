package me.meeshy.app.navigation.graph

import androidx.compose.animation.AnimatedContentScope
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.runtime.Composable
import androidx.navigation.NamedNavArgument
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
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
import me.meeshy.app.settings.MediaCacheScreen
import me.meeshy.app.settings.MediaDownloadScreen
import me.meeshy.app.settings.NotificationSettingsScreen
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
    settingsComposable(Routes.SETTINGS) {
        SettingsScreen(
            onBack = { navController.popBackStack() },
            // La racine bascule sur LOGIN quand la session est fermée (startDestination) :
            // naviguer ici, avant la fin de l'appel serveur, renvoyait vers la liste.
            onLogout = { authViewModel.logout() },
            onOpenProfile = { userId -> ProfileRoutes.own(userId)?.let { navController.navigate(it) } },
            onOpenStarred = { navController.navigate(Routes.STARRED) },
            onOpenSaved = { navController.navigate(Routes.SAVED_POSTS) },
            onOpenShareLinks = { navController.navigate(Routes.MY_SHARE_LINKS) },
            onOpenSecurity = { navController.navigate(Routes.SECURITY) },
            onOpenNotificationSettings = { navController.navigate(Routes.NOTIFICATION_SETTINGS) },
            onOpenAutoDownload = { navController.navigate(Routes.MEDIA_DOWNLOAD) },
            onOpenMediaCache = { navController.navigate(Routes.MEDIA_CACHE) },
            onOpenPrivacy = { navController.navigate(Routes.PRIVACY) },
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
    settingsComposable(Routes.NOTIFICATION_SETTINGS) {
        NotificationSettingsScreen(onBack = { navController.popBackStack() })
    }
    settingsComposable(Routes.CHANGE_PASSWORD) {
        ChangePasswordScreen(onBack = { navController.popBackStack() })
    }
    settingsComposable(
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
    settingsComposable(Routes.SECURITY) { SecurityRoute(navController) }
    settingsComposable(Routes.ACCOUNT_CONTACT) { SecurityRoute(navController) }
    settingsComposable(Routes.DELETE_ACCOUNT) {
        AccountDeletionScreen(onBack = { navController.popBackStack() })
    }
    settingsComposable(Routes.MEDIA_DOWNLOAD) {
        MediaDownloadScreen(onBack = { navController.popBackStack() })
    }
    settingsComposable(Routes.MEDIA_CACHE) {
        MediaCacheScreen(onBack = { navController.popBackStack() })
    }
    settingsComposable(Routes.DATA_EXPORT) {
        DataExportScreen(onBack = { navController.popBackStack() })
    }
    settingsComposable(Routes.DIAGNOSTICS) {
        CrashReportScreen(onBack = { navController.popBackStack() })
    }
    settingsComposable(Routes.ABOUT) {
        AboutScreen(onBack = { navController.popBackStack() })
    }
    settingsComposable(Routes.SUPPORT) {
        SupportScreen(onBack = { navController.popBackStack() })
    }
    settingsComposable(Routes.LICENSES) {
        LicensesScreen(onBack = { navController.popBackStack() })
    }
    settingsComposable(
        route = Routes.LEGAL,
        arguments = listOf(navArgument(Routes.LEGAL_DOC_ARG) { type = NavType.StringType }),
    ) { backStackEntry ->
        val kind = LegalDocumentKind.fromArg(
            backStackEntry.arguments?.getString(Routes.LEGAL_DOC_ARG),
        ) ?: LegalDocumentKind.TERMS_OF_SERVICE
        LegalDocumentScreen(kind = kind, onBack = { navController.popBackStack() })
    }
    settingsComposable(Routes.PRIVACY) {
        PrivacySettingsScreen(onBack = { navController.popBackStack() })
    }
    settingsComposable(Routes.ACTIVE_SESSIONS) {
        ActiveSessionsScreen(onBack = { navController.popBackStack() })
    }
    settingsComposable(Routes.ENCRYPTED_DEVICES) {
        EncryptedDevicesScreen(onBack = { navController.popBackStack() })
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
        onOpenEncryptedDevices = { navController.navigate(Routes.ENCRYPTED_DEVICES) },
    )
}

private const val PUSH_MILLIS = 300
private const val POP_FADE_MILLIS = 200

/** Pousser un sous-écran des Réglages glisse depuis le bord de fin, comme le push d'iOS ; le retour le ramène. */
private fun NavGraphBuilder.settingsComposable(
    route: String,
    arguments: List<NamedNavArgument> = emptyList(),
    content: @Composable AnimatedContentScope.(NavBackStackEntry) -> Unit,
) = composable(
    route = route,
    arguments = arguments,
    enterTransition = { slideInHorizontally(tween(PUSH_MILLIS)) { it / 4 } + fadeIn(tween(PUSH_MILLIS)) },
    exitTransition = { slideOutHorizontally(tween(PUSH_MILLIS)) { -it / 6 } + fadeOut(tween(POP_FADE_MILLIS)) },
    popEnterTransition = { slideInHorizontally(tween(PUSH_MILLIS)) { -it / 6 } + fadeIn(tween(PUSH_MILLIS)) },
    popExitTransition = { slideOutHorizontally(tween(PUSH_MILLIS)) { it / 4 } + fadeOut(tween(POP_FADE_MILLIS)) },
    content = content,
)
