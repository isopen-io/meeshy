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
import me.meeshy.app.navigation.sheetComposable
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
            onOpenProgression = { navController.navigate(GameRoutes.PROGRESSION) },
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
    sheetComposable(Routes.SECURITY, navController) { _, dismiss -> SecurityRoute(navController, dismiss) }
    sheetComposable(Routes.ACCOUNT_CONTACT, navController) { _, dismiss -> SecurityRoute(navController, dismiss) }
    sheetComposable(Routes.DELETE_ACCOUNT, navController) { _, dismiss ->
        AccountDeletionScreen(onBack = dismiss)
    }
    sheetComposable(Routes.MEDIA_DOWNLOAD, navController) { _, dismiss ->
        MediaDownloadScreen(onBack = dismiss)
    }
    sheetComposable(Routes.MEDIA_CACHE, navController) { _, dismiss ->
        MediaCacheScreen(onBack = dismiss)
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
        LicensesScreen(onBack = dismiss)
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
private fun SecurityRoute(navController: NavHostController, dismiss: () -> Unit) {
    SecurityScreen(
        onBack = dismiss,
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
