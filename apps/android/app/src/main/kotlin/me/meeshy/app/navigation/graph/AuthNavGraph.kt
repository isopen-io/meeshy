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
import me.meeshy.app.auth.WorldGuestEntryScreen
import me.meeshy.app.navigation.Routes
import me.meeshy.app.navigation.SheetStyle
import me.meeshy.app.navigation.sheetComposable
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
    sheetComposable(Routes.FORGOT_PASSWORD, navController) { _, dismiss ->
        ForgotPasswordScreen(onBack = dismiss)
    }
    sheetComposable(Routes.MAGIC_LINK, navController) { _, dismiss ->
        MagicLinkScreen(onBack = dismiss)
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
            // Refuser un lien qu'on n'a pas demande ne deconnecte personne : un compte ouvert reste ouvert.
            onDeclined = {
                val destination = if (authViewModel.state.value.isAuthenticated) Routes.CONVERSATIONS else Routes.LOGIN
                navController.navigate(destination) {
                    popUpTo(0) { inclusive = true }
                }
            },
        )
    }
    // L'inscription tient en UN écran (#5219) : `Routes.REGISTRATION`
    // conserve son chemin — le lien depuis la connexion, les tests et
    // l'historique de navigation le nomment — mais rend `SignupScreen`.
    sheetComposable(Routes.REGISTRATION, navController) { _, dismiss ->
        SignupScreen(
            onClose = dismiss,
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
    sheetComposable(
        route = Routes.GUEST_JOIN,
        navController = navController,
        style = SheetStyle.COVER,
        deepLinks = listOf(
            navDeepLink { uriPattern = Routes.GUEST_JOIN_DEEP_LINK },
            navDeepLink { uriPattern = Routes.GUEST_JOIN_WEB_DEEP_LINK },
            navDeepLink { uriPattern = Routes.GUEST_JOIN_CHAT_WEB_DEEP_LINK },
        ),
    ) { _, dismiss ->
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
            onBack = dismiss,
            onSignIn = {
                navController.navigate(Routes.LOGIN) {
                    popUpTo(Routes.GUEST_JOIN) { inclusive = true }
                }
            },
        )
    }
    sheetComposable(
        route = Routes.WORLD_ENTRY,
        navController = navController,
        style = SheetStyle.COVER,
        deepLinks = listOf(
            navDeepLink { uriPattern = Routes.WORLD_ENTRY_DEEP_LINK },
            navDeepLink { uriPattern = Routes.WORLD_ENTRY_WEB_DEEP_LINK },
        ),
    ) { _, dismiss ->
        WorldGuestEntryScreen(
            onEntered = { conversationId ->
                navController.navigate(Routes.chat(conversationId)) {
                    popUpTo(Routes.WORLD_ENTRY) { inclusive = true }
                }
            },
            // Un compte ouvert n'entre jamais en invité : la porte des comptes choisit l'identité.
            onJoinWithAccount = { linkKey ->
                navController.navigate(Routes.guestJoin(linkKey)) {
                    popUpTo(Routes.WORLD_ENTRY) { inclusive = true }
                }
            },
            onClose = dismiss,
        )
    }
}
