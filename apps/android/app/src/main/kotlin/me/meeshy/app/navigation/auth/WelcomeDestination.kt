package me.meeshy.app.navigation.auth

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import kotlinx.coroutines.flow.emptyFlow
import me.meeshy.app.auth.AuthViewModel
import me.meeshy.app.auth.SignupScreen
import me.meeshy.app.auth.WelcomeScreen
import me.meeshy.app.auth.WelcomeUiEvent
import me.meeshy.app.auth.WelcomeViewModel
import me.meeshy.app.navigation.Routes
import me.meeshy.app.navigation.VisitorContentHostViewModel
import me.meeshy.app.navigation.rootSplashPhase
import me.meeshy.sdk.model.legal.LegalDocumentKind
import me.meeshy.sdk.model.rootnav.RootPresentationRules
import me.meeshy.ui.component.FeedbackToastHost
import me.meeshy.ui.component.FeedbackToastRequest

/**
 * L'accueil de premier lancement, plein écran par-dessus la connexion (iOS `WelcomeView` présenté par la racine).
 * L'éligibilité est la loi de [RootPresentationRules.showsWelcome] ; « Créer un compte » ouvre l'inscription plein
 * écran, avec son propre canal de toasts au-dessus de l'accueil ; « Se connecter » solde l'accueil et laisse la
 * connexion dessous.
 */
@Composable
internal fun WelcomeHost(
    navController: NavHostController,
    authViewModel: AuthViewModel,
    isAuthenticated: Boolean,
) {
    val viewModel = hiltViewModel<WelcomeViewModel>()
    val state by viewModel.state.collectAsStateWithLifecycle()
    val visitorRequest by hiltViewModel<VisitorContentHostViewModel>().presenter.request.collectAsStateWithLifecycle()
    val eligible = RootPresentationRules.showsWelcome(
        hasSeenWelcome = state.hasSeenWelcome,
        isAuthenticated = isAuthenticated,
        splashPhase = rootSplashPhase(),
        hasGuestSession = false,
        hasVisitorRequest = visitorRequest != null,
    )
    if (!eligible) return
    Box(Modifier.fillMaxSize()) {
        WelcomeScreen(
            onCreateAccount = { viewModel.onEvent(WelcomeUiEvent.CreateAccountTapped) },
            onSignIn = { viewModel.onEvent(WelcomeUiEvent.SignInTapped) },
        )
        if (state.isSigningUp) {
            BackHandler { viewModel.onEvent(WelcomeUiEvent.SignupClosed) }
            Box(Modifier.fillMaxSize()) {
                SignupScreen(
                    onClose = { viewModel.onEvent(WelcomeUiEvent.SignupClosed) },
                    onRegistered = {
                        authViewModel.onExternalSessionOpened()
                        viewModel.onEvent(WelcomeUiEvent.AccountCreated)
                        navController.navigate(Routes.CONVERSATIONS) { popUpTo(Routes.LOGIN) { inclusive = true } }
                    },
                    onOpenTerms = { navController.navigate(Routes.legal(LegalDocumentKind.TERMS_OF_SERVICE)) },
                    onOpenPrivacy = { navController.navigate(Routes.legal(LegalDocumentKind.PRIVACY_POLICY)) },
                )
                FeedbackToastHost(toasts = remember { emptyFlow<FeedbackToastRequest>() })
            }
        }
    }
}
