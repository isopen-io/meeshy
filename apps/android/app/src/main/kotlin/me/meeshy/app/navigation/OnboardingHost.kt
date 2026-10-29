package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.app.auth.AuthViewModel
import me.meeshy.app.navigation.graph.GameRoutes
import me.meeshy.app.onboarding.OnboardingLayer
import me.meeshy.app.onboarding.OnboardingNavigation
import me.meeshy.app.onboarding.OnboardingViewModel
import me.meeshy.sdk.game.OnboardingPresence
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.session.SessionRepository

/** Ce que la racine sait décider de l'onboarding, sans le modèle : où il passe, ce qu'il recouvre. */
internal object OnboardingRootRules {
    fun isStoryComposer(route: String?): Boolean = route?.startsWith(Routes.STORY_COMPOSER) == true

    /** Un lien profond ou un push qui a mené ailleurs que les onglets : le calque attend le retour. */
    fun isRoutedElsewhere(route: String?): Boolean = route != null && route !in tabRoutes

    /** Le calque recouvre la racine (contenu, chrome) tant qu'il est présent — hors composeur de story, qu'il laisse libre. */
    fun coversRoot(isPresented: Boolean, currentRoute: String?): Boolean =
        isPresented && !isStoryComposer(currentRoute)
}

@HiltViewModel
class OnboardingHostViewModel @Inject constructor(
    session: SessionRepository,
    val presence: OnboardingPresence,
) : ViewModel() {
    val user: StateFlow<MeeshyUser?> = session.currentUser
}

/**
 * **L'onboarding à la racine** (miroir d'`OnboardingHost`, iOS) : posé UNE fois par-dessus la navigation, il démarre au
 * premier utilisateur connu, publie [OnboardingPresence] et ouvre les portes qui sortent du calque.
 */
@Composable
internal fun OnboardingHost(
    navController: NavHostController,
    onboarding: OnboardingViewModel,
    authViewModel: AuthViewModel,
    isAuthenticated: Boolean,
    currentRoute: String?,
    host: OnboardingHostViewModel = hiltViewModel(),
) {
    val user by host.user.collectAsStateWithLifecycle()
    val celebrating by hiltViewModel<ArrivalCelebrationViewModel>().controller.isShowing.collectAsStateWithLifecycle()
    OnboardingLayer(
        viewModel = onboarding,
        presence = host.presence,
        user = user.takeIf { isAuthenticated },
        isRoutedElsewhere = OnboardingRootRules.isRoutedElsewhere(currentRoute),
        isCelebrating = celebrating,
        isStoryComposerOpen = OnboardingRootRules.isStoryComposer(currentRoute),
        navigation = OnboardingNavigation(
            openStoryComposer = { navController.navigate(Routes.STORY_COMPOSER) },
            openConversation = { navController.navigate(Routes.chat(it)) },
            openProgression = { navController.navigate(GameRoutes.PROGRESSION) { launchSingleTop = true } },
            signOut = { authViewModel.logout() },
        ),
    )
}
