package me.meeshy.app.navigation.graph

import me.meeshy.app.navigation.navigateSingleTop
import me.meeshy.app.navigation.pushFrom
import androidx.compose.runtime.Composable
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import me.meeshy.app.auth.AuthViewModel
import me.meeshy.app.auth.ForgotPasswordScreen
import me.meeshy.app.auth.LoginScreen
import me.meeshy.app.auth.MagicLinkSheet
import me.meeshy.app.auth.MagicLinkValidateScreen
import me.meeshy.app.auth.MagicLinkValidateViewModel
import me.meeshy.app.auth.NewPasswordScreen
import me.meeshy.app.auth.NewPasswordViewModel
import me.meeshy.app.auth.ShareLinkEntryScreen
import me.meeshy.app.auth.ShareLinkEntryViewModel
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
    composable(Routes.LOGIN) { entry ->
        LoginScreen(
            viewModel = authViewModel,
            onAuthenticated = {
                navController.navigateSingleTop(Routes.CONVERSATIONS) {
                    popUpTo(Routes.LOGIN) { inclusive = true }
                }
            },
            onSignUp = { navController.pushFrom(entry, Routes.REGISTRATION) },
            onForgotPassword = { navController.pushFrom(entry, Routes.FORGOT_PASSWORD) },
            onMagicLink = { navController.pushFrom(entry, Routes.MAGIC_LINK) },
        )
    }
    sheetComposable(Routes.FORGOT_PASSWORD, navController) { _, dismiss ->
        ForgotPasswordScreen(onBack = dismiss)
    }
    sheetComposable(Routes.MAGIC_LINK, navController) { _, dismiss ->
        MagicLinkSheet(
            onBack = dismiss,
            // Le code saisi ouvre la session feuille refermée : la racine bascule comme pour le lien reçu.
            onSessionOpened = {
                authViewModel.onExternalSessionOpened()
                navController.navigateSingleTop(Routes.CONVERSATIONS) { popUpTo(0) { inclusive = true } }
            },
            onSecondFactor = authViewModel::completeEmailProof,
        )
    }
    composable(
        route = Routes.MAGIC_LINK_VALIDATE,
        arguments = listOf(linkArgument(MagicLinkValidateViewModel.TOKEN_ARG)),
    ) {
        EmailLinkValidation(navController, authViewModel)
    }
    // Le lien de l'e-mail « code + lien » : il PROUVE l'adresse (jeton + adresse) et ouvre la session, par le meme
    // ecran, la meme question et la meme garde de changement de compte que le lien de connexion (iOS `SignInLink`).
    composable(
        route = Routes.VERIFY_EMAIL_LINK,
        arguments = listOf(
            linkArgument(MagicLinkValidateViewModel.TOKEN_ARG),
            linkArgument(MagicLinkValidateViewModel.EMAIL_ARG),
        ),
    ) {
        EmailLinkValidation(navController, authViewModel)
    }
    // Le lien de l'e-mail de reinitialisation (iOS `PasswordResetLinkPresenter` + `MeeshyNewPasswordView`) : une
    // feuille par-dessus ce qui est ouvert, connecte ou non — le jeton designe son compte, pas la session.
    sheetComposable(
        route = Routes.RESET_PASSWORD,
        navController = navController,
        arguments = listOf(
            navArgument(NewPasswordViewModel.TOKEN_ARG) {
                type = NavType.StringType
                nullable = true
                defaultValue = null
            },
        ),
    ) { entry, dismiss ->
        NewPasswordScreen(
            onClose = dismiss,
            onSignIn = dismiss,
            onRequestNewLink = {
                navController.pushFrom(entry, Routes.FORGOT_PASSWORD) {
                    popUpTo(Routes.RESET_PASSWORD) { inclusive = true }
                }
            },
        )
    }
    // L'inscription tient en UN écran (#5219) : `Routes.REGISTRATION`
    // conserve son chemin — le lien depuis la connexion, les tests et
    // l'historique de navigation le nomment — mais rend `SignupScreen`.
    // iOS présente l'inscription en `.fullScreenCover` (LoginView) : pas de glissé qui la fermerait pendant l'envoi.
    sheetComposable(Routes.REGISTRATION, navController, style = SheetStyle.COVER) { entry, dismiss ->
        SignupScreen(
            onClose = dismiss,
            onRegistered = {
                authViewModel.onExternalSessionOpened()
                navController.navigateSingleTop(Routes.CONVERSATIONS) {
                    popUpTo(Routes.LOGIN) { inclusive = true }
                }
            },
            onOpenTerms = {
                navController.pushFrom(entry, Routes.legal(LegalDocumentKind.TERMS_OF_SERVICE))
            },
            onOpenPrivacy = {
                navController.pushFrom(entry, Routes.legal(LegalDocumentKind.PRIVACY_POLICY))
            },
            // « Est-ce vous ? » : le code et le lien sont partis, la connexion par e-mail s'ouvre sur son attente.
            onOpenSignInLink = { navController.pushFrom(entry, Routes.MAGIC_LINK) },
            onOpenForgotPassword = { navController.pushFrom(entry, Routes.FORGOT_PASSWORD) },
        )
    }
    sheetComposable(
        route = Routes.GUEST_JOIN,
        navController = navController,
        style = SheetStyle.COVER,
        arguments = listOf(linkArgument(ShareLinkEntryViewModel.ANONYMOUS_ARG)),
        deepLinks = listOf(
            navDeepLink { uriPattern = Routes.GUEST_JOIN_DEEP_LINK },
            navDeepLink { uriPattern = Routes.GUEST_JOIN_WEB_DEEP_LINK },
            navDeepLink { uriPattern = Routes.GUEST_JOIN_CHAT_WEB_DEEP_LINK },
        ),
    ) { entry, dismiss ->
        ShareLinkEntryScreen(
            onOpenConversation = { conversationId ->
                navController.pushFrom(entry, Routes.chat(conversationId)) {
                    popUpTo(Routes.GUEST_JOIN) { inclusive = true }
                }
            },
            onJoined = {
                navController.navigateSingleTop(Routes.CONVERSATIONS) {
                    popUpTo(Routes.GUEST_JOIN) { inclusive = true }
                }
            },
            onBack = dismiss,
            onSignIn = {
                navController.pushFrom(entry, Routes.LOGIN) {
                    popUpTo(Routes.GUEST_JOIN) { inclusive = true }
                    launchSingleTop = true
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
    ) { entry, dismiss ->
        WorldGuestEntryScreen(
            onEntered = { conversationId ->
                navController.navigateSingleTop(Routes.chat(conversationId)) {
                    popUpTo(Routes.WORLD_ENTRY) { inclusive = true }
                }
            },
            // Un compte ouvert n'entre jamais en invité : la porte des comptes choisit l'identité.
            onJoinWithAccount = { linkKey ->
                navController.pushFrom(entry, Routes.guestJoin(linkKey)) {
                    popUpTo(Routes.WORLD_ENTRY) { inclusive = true }
                }
            },
            onClose = dismiss,
        )
    }
}

private fun linkArgument(name: String) = navArgument(name) {
    type = NavType.StringType
    nullable = true
    defaultValue = null
}

@Composable
private fun EmailLinkValidation(navController: NavHostController, authViewModel: AuthViewModel) {
    MagicLinkValidateScreen(
        onAuthenticated = {
            authViewModel.onExternalSessionOpened()
            navController.navigateSingleTop(Routes.CONVERSATIONS) {
                popUpTo(0) { inclusive = true }
            }
        },
        onBackToLogin = {
            navController.navigateSingleTop(Routes.LOGIN) {
                popUpTo(0) { inclusive = true }
            }
        },
        // Refuser un lien qu'on n'a pas demande ne deconnecte personne : un compte ouvert reste ouvert.
        onDeclined = {
            val destination = if (authViewModel.state.value.isAuthenticated) Routes.CONVERSATIONS else Routes.LOGIN
            navController.navigateSingleTop(destination) {
                popUpTo(0) { inclusive = true }
            }
        },
    )
}
