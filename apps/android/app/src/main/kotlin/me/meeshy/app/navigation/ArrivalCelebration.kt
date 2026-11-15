package me.meeshy.app.navigation

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.draw.alpha
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.app.auth.ArrivalCelebrationScreen
import me.meeshy.app.auth.AuthViewModel
import me.meeshy.sdk.auth.ArrivalCelebrationController
import me.meeshy.sdk.model.rootnav.SplashPhase
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import me.meeshy.sdk.model.rootnav.RootPresentationRules

/** Duree du fondu de la celebration d'arrivee (iOS : `easeInOut(duration: 0.35)`). */
internal const val ARRIVAL_CELEBRATION_FADE_MS = 350

@HiltViewModel
class ArrivalCelebrationViewModel @Inject constructor(
    val controller: ArrivalCelebrationController,
) : ViewModel()

/** Vrai tant que la celebration couvre l'ecran : le contenu dessous est masque a TalkBack. */
fun isContentHiddenByCelebration(isAuthenticated: Boolean, isShowing: Boolean): Boolean =
    RootPresentationRules.showsCelebration(isAuthenticated = isAuthenticated, isShowing = isShowing)

/** Masque le contenu a TalkBack tant que la celebration est presente. */
fun Modifier.hiddenFromAccessibilityWhile(hidden: Boolean): Modifier =
    if (hidden) clearAndSetSemantics {} else this

@Composable
internal fun ArrivalCelebration(
    isShowing: Boolean,
    onSkip: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(
        visible = isShowing,
        enter = fadeIn(tween(ARRIVAL_CELEBRATION_FADE_MS)),
        exit = fadeOut(tween(ARRIVAL_CELEBRATION_FADE_MS)),
        modifier = modifier,
    ) {
        ArrivalCelebrationScreen(onContinue = onSkip)
    }
}

/**
 * Le contenu de la racine reste monte mais a opacite 0 tant que le rideau couvre, et il est
 * masque a TalkBack sous le rideau comme sous la celebration d'arrivee.
 */
@Composable
internal fun Modifier.rootPresentationContent(): Modifier {
    val phase = rootSplashPhase()
    val authenticated by hiltViewModel<AuthViewModel>().state.collectAsStateWithLifecycle()
    val celebrating by hiltViewModel<ArrivalCelebrationViewModel>().controller.isShowing.collectAsStateWithLifecycle()
    val hidden = phase == SplashPhase.COVERING || isContentHiddenByCelebration(authenticated.isAuthenticated, celebrating)
    return alpha(RootPresentationRules.contentAlpha(phase)).hiddenFromAccessibilityWhile(hidden)
}

/** La celebration plein ecran, posee par-dessus le contenu (sous le rideau de demarrage). */
@Composable
internal fun ArrivalCelebrationHost() {
    val authenticated by hiltViewModel<AuthViewModel>().state.collectAsStateWithLifecycle()
    val controller = hiltViewModel<ArrivalCelebrationViewModel>().controller
    val showing by controller.isShowing.collectAsStateWithLifecycle()
    ArrivalCelebration(
        isShowing = RootPresentationRules.showsCelebration(authenticated.isAuthenticated, showing),
        onSkip = controller::dismiss,
    )
}
