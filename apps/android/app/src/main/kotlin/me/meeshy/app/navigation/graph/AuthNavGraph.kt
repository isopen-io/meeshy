package me.meeshy.app.navigation.graph

import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import me.meeshy.app.auth.AuthViewModel
import me.meeshy.app.auth.ForgotPasswordScreen
import me.meeshy.app.auth.LoginScreen
import me.meeshy.app.auth.MagicLinkScreen
import me.meeshy.app.auth.MagicLinkValidateScreen
import me.meeshy.app.auth.MagicLinkValidateViewModel
import me.meeshy.app.auth.ShareLinkEntryScreen
import me.meeshy.app.auth.SignupScreen
import me.meeshy.app.navigation.Routes
import me.meeshy.sdk.model.legal.LegalDocumentKind

/** Connexion, inscription, lien magique et entree par lien de partage invite. */
internal fun NavGraphBuilder.authNavGraph(
    navController: NavHostController,
    authViewModel: AuthViewModel,
) {
    composable(Routes.LOGIN) {
        LoginScreen(
            viewModel = authViewModel,
            onAuthenticated = {
                navController.navigate(Routes.CONVERSATIONS) {
                    popUpTo(Routes.LOGIN) { inclusive = true }
                }
            },
            onSignUp = { navController.navigate(Routes.REGISTRATION) },
            onForgotPassword = { navController.navigate(Routes.FORGOT_PASSWORD) },
            onMagicLink = { navController.navigate(Routes.MAGIC_LINK) },
        )
    }
    composable(Routes.FORGOT_PASSWORD) {
        ForgotPasswordScreen(onBack = { navController.popBackStack() })
    }
    composable(Routes.MAGIC_LINK) {
        MagicLinkScreen(onBack = { navController.popBackStack() })
    }
    composable(
        route = Routes.MAGIC_LINK_VALIDATE,
        arguments = listOf(
            navArgument(MagicLinkValidateViewModel.TOKEN_ARG) {
                type = NavType.StringType
                nullable = true
                defaultValue = null
            },
        ),
    ) {
        MagicLinkValidateScreen(
            onAuthenticated = {
                authViewModel.onExternalSessionOpened()
                navController.navigate(Routes.CONVERSATIONS) {
                    popUpTo(0) { inclusive = true }
                }
            },
            onBackToLogin = {
                navController.navigate(Routes.LOGIN) {
                    popUpTo(0) { inclusive = true }
                }
            },
        )
    }
    // L'inscription tient en UN écran (#5219) : `Routes.REGISTRATION`
    // conserve son chemin — le lien depuis la connexion, les tests et
    // l'historique de navigation le nomment — mais rend `SignupScreen`.
    composable(Routes.REGISTRATION) {
        SignupScreen(
            onClose = { navController.popBackStack() },
            onRegistered = {
                navController.navigate(Routes.CONVERSATIONS) {
                    popUpTo(Routes.LOGIN) { inclusive = true }
                }
            },
            onOpenTerms = {
                navController.navigate(Routes.legal(LegalDocumentKind.TERMS_OF_SERVICE))
            },
            onOpenPrivacy = {
                navController.navigate(Routes.legal(LegalDocumentKind.PRIVACY_POLICY))
            },
        )
    }
    composable(
        route = Routes.GUEST_JOIN,
        deepLinks = listOf(
            navDeepLink { uriPattern = Routes.GUEST_JOIN_DEEP_LINK },
            navDeepLink { uriPattern = Routes.GUEST_JOIN_WEB_DEEP_LINK },
            navDeepLink { uriPattern = Routes.GUEST_JOIN_CHAT_WEB_DEEP_LINK },
        ),
    ) {
        ShareLinkEntryScreen(
            onOpenConversation = { conversationId ->
                navController.navigate(Routes.chat(conversationId)) {
                    popUpTo(Routes.GUEST_JOIN) { inclusive = true }
                }
            },
            onJoined = {
                navController.navigate(Routes.CONVERSATIONS) {
                    popUpTo(Routes.GUEST_JOIN) { inclusive = true }
                }
            },
            onBack = { navController.popBackStack() },
            onSignIn = {
                navController.navigate(Routes.LOGIN) {
                    popUpTo(Routes.GUEST_JOIN) { inclusive = true }
                }
            },
        )
    }
}
