package me.meeshy.app.navigation

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import me.meeshy.app.calls.CallViewModel
import me.meeshy.ui.theme.MeeshySpacing

/**
 * L'appel réduit en haut de l'application (#17767) : la pastille n'apparaît ni ne disparaît d'un coup, elle arrive et
 * repart par le fondu et l'échelle courts de [CallCapsuleTransitions], pendant que l'appel plein écran se contracte ou se
 * redéploie. Un toucher reconstruit la route CALL depuis la configuration vivante ; le [callViewModel] de l'activité est
 * repris, donc `start()` est inerte.
 *
 * « Réduire les animations » (réglage système OU forçage de l'application) est fourni SOUS ce niveau, par
 * `AccessibilityLocalsProvider` dans `ProvideAppLocals` : on lit la valeur que [FeedOverlayMotionLocalsProvider] relaie à
 * toute l'application, la même que lisent les transitions du `NavHost`.
 */
@Composable
internal fun AnimatedMinimizedCallPill(
    visible: Boolean,
    callViewModel: CallViewModel,
    navController: NavHostController,
) {
    val reduceMotion = FeedOverlayTransition.reduceMotion
    AnimatedVisibility(
        visible = visible,
        enter = CallCapsuleTransitions.enter(reduceMotion),
        exit = CallCapsuleTransitions.exit(reduceMotion),
    ) {
        MinimizedCallPill(
            callViewModel = callViewModel,
            navController = navController,
            modifier = Modifier
                .statusBarsPadding()
                .padding(vertical = MeeshySpacing.xs),
        )
    }
}
