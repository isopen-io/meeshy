package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import me.meeshy.app.auth.visitor.VisitorContentScreen
import me.meeshy.sdk.model.rootnav.RootPresentationRules

@HiltViewModel
class VisitorContentHostViewModel @Inject constructor(val presenter: VisitorContentPresenter) : ViewModel()

/**
 * Le contenu public d'un lien ouvert sans session, au-dessus de la connexion (iOS `visitorContentCover`). L'eligibilite est
 * la loi de [RootPresentationRules] : ni compte, ni session invitee, et jamais sous le rideau de demarrage. « Creer un
 * compte » referme l'ecran et ouvre l'inscription ; « Se connecter » le referme sur la connexion. Le lien en attente
 * n'est pas touche : il s'ouvre apres la connexion.
 */
@Composable
internal fun VisitorContentHost(navController: NavHostController, isAuthenticated: Boolean) {
    val presenter = hiltViewModel<VisitorContentHostViewModel>().presenter
    val request by presenter.request.collectAsStateWithLifecycle()
    val eligible = RootPresentationRules.visitorContentIsEligible(
        isAuthenticated = isAuthenticated,
        hasGuestSession = false,
        splashPhase = rootSplashPhase(),
    )
    LaunchedEffect(isAuthenticated) { if (isAuthenticated) presenter.dismiss() }
    val current = request?.takeIf { eligible } ?: return
    VisitorContentScreen(
        request = current,
        onSignUp = {
            presenter.dismiss()
            navController.navigate(Routes.REGISTRATION) { launchSingleTop = true }
        },
        onSignIn = presenter::dismiss,
        onClose = presenter::dismiss,
    )
}
