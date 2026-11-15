package me.meeshy.app.navigation

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.navigation.NavBackStackEntry
import me.meeshy.sdk.model.feed.FeedOverlayAppearance

/**
 * Le Flux est une SURCOUCHE de la liste (iOS `RootView` : `.move(edge: .bottom)` + opacité à l'entrée ; bas +
 * échelle 0,95 + opacité à la sortie), pas un onglet qui se fond. Cette spécification ne s'applique que lorsque
 * l'autre côté de la transition est une racine ; vers un écran empilé (détail, Reels), le Flux garde la poussée
 * commune de [stackExit].
 */
internal object FeedOverlayTransition {

    enum class Kind { OVERLAY, STACKED }

    private const val ENTER_MILLIS = 400
    private const val EXIT_MILLIS = 300

    /** Le côté opposé est-il une racine (surcouche) ou un écran empilé (poussée commune) ? */
    fun kindFor(otherRoute: String?): Kind =
        if (NavBackChrome.of(otherRoute) == BackChrome.ROOT || NavBackChrome.of(otherRoute) == null) Kind.OVERLAY else Kind.STACKED

    /** « Réduire les animations », tenu à jour par [FeedOverlayMotionLocalsProvider] : les lambdas du NavHost ne sont pas composables. */
    @Volatile
    var reduceMotion: Boolean = false

    private fun NavBackStackEntry.route(): String? = destination.route

    fun enter(scope: AnimatedContentTransitionScope<NavBackStackEntry>): EnterTransition {
        if (kindFor(scope.initialState.route()) == Kind.STACKED) return with(scope) { stackEnter() }
        val motion = FeedOverlayAppearance.motion(reduceMotion)
        val fade = fadeIn(tween(ENTER_MILLIS))
        return if (motion.entersFromBottom) fade + slideInVertically(tween(ENTER_MILLIS)) { it } else fade
    }

    fun exit(scope: AnimatedContentTransitionScope<NavBackStackEntry>): ExitTransition {
        if (kindFor(scope.targetState.route()) == Kind.STACKED) return with(scope) { stackExit() }
        val motion = FeedOverlayAppearance.motion(reduceMotion)
        val fade = fadeOut(tween(EXIT_MILLIS))
        return if (motion.exitsToBottom) {
            fade + slideOutVertically(tween(EXIT_MILLIS)) { it } + scaleOut(tween(EXIT_MILLIS), targetScale = motion.exitScale)
        } else {
            fade
        }
    }

    fun popExit(scope: AnimatedContentTransitionScope<NavBackStackEntry>): ExitTransition {
        if (kindFor(scope.targetState.route()) == Kind.STACKED) return with(scope) { stackPopExit() }
        return exit(scope)
    }
}
