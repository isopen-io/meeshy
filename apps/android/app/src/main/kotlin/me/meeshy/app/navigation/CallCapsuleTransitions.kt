package me.meeshy.app.navigation

import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.ui.graphics.TransformOrigin
import me.meeshy.sdk.model.call.CallShareCapsuleMotion
import me.meeshy.sdk.model.call.CallWindowMotion

/**
 * #17767 — l'appel se contracte vers la capsule de partage et s'y redéploie (iOS `CallShareCapsuleMotion`) : un fondu et
 * une mise à l'échelle courts, en `graphicsLayer` donc sans recomposition par image. « Réduire les animations » ne
 * garde que le fondu.
 *
 * #18218 (S1.7, S2.1, P18.4, P18.8) — l'écran d'appel ([windowEnter], [windowExit]) se contracte VERS la capsule posée en
 * haut de l'application et se redéploie DEPUIS elle, comme iOS, plus jamais vers le centre. La capsule elle-même
 * ([enter], [exit]) garde son apparition courte. Les lambdas du `NavHost` ne sont pas composables : [capsuleLive] est
 * tenu à jour par l'hôte de la capsule (`AnimatedMinimizedCallPill`), comme `FeedOverlayTransition.reduceMotion`.
 */
internal object CallCapsuleTransitions {

    /** Un appel vivant, que la capsule porte dès qu'on quitte son écran (`CallPillPresenter.isMinimizable`). */
    @Volatile
    var capsuleLive: Boolean = false

    /** La capsule qui apparaît. */
    fun enter(reduceMotion: Boolean): EnterTransition {
        val millis = CallShareCapsuleMotion.windowFadeMillis(reduceMotion, appearing = true)
        val fade = fadeIn(tween(millis))
        return if (reduceMotion) fade else fade + scaleIn(tween(millis), initialScale = CallShareCapsuleMotion.startScale(reduceMotion))
    }

    /** La capsule qui s'efface. */
    fun exit(reduceMotion: Boolean): ExitTransition {
        val millis = CallShareCapsuleMotion.windowFadeMillis(reduceMotion, appearing = false)
        val fade = fadeOut(tween(millis))
        return if (reduceMotion) fade else fade + scaleOut(tween(millis), targetScale = CallShareCapsuleMotion.startScale(reduceMotion))
    }

    /** L'appel qui se déploie depuis la capsule ([capsuleLive]), ou qui s'ouvre pour la première fois. */
    fun windowEnter(reduceMotion: Boolean, capsuleLive: Boolean): EnterTransition {
        val millis = CallShareCapsuleMotion.windowFadeMillis(reduceMotion, appearing = true)
        val fade = fadeIn(tween(millis))
        val motion = CallShareCapsuleMotion.window(reduceMotion, capsuleLive)
        return if (motion.isFadeOnly()) fade else fade + scaleIn(tween(millis), initialScale = motion.scale, transformOrigin = motion.origin())
    }

    /** L'appel qui se contracte vers la capsule ([capsuleLive]), ou qui se ferme. */
    fun windowExit(reduceMotion: Boolean, capsuleLive: Boolean): ExitTransition {
        val millis = CallShareCapsuleMotion.windowFadeMillis(reduceMotion, appearing = false)
        val fade = fadeOut(tween(millis))
        val motion = CallShareCapsuleMotion.window(reduceMotion, capsuleLive)
        return if (motion.isFadeOnly()) fade else fade + scaleOut(tween(millis), targetScale = motion.scale, transformOrigin = motion.origin())
    }

    /** L'écran qui reste dessous pendant le passage : il s'efface ou revient en fondu, sans échelle. */
    fun underlayEnter(reduceMotion: Boolean): EnterTransition =
        fadeIn(tween(CallShareCapsuleMotion.windowFadeMillis(reduceMotion, appearing = true)))

    fun underlayExit(reduceMotion: Boolean): ExitTransition =
        fadeOut(tween(CallShareCapsuleMotion.windowFadeMillis(reduceMotion, appearing = false)))

    private fun CallWindowMotion.isFadeOnly(): Boolean = scale == 1f

    private fun CallWindowMotion.origin(): TransformOrigin = TransformOrigin(pivotX, pivotY)
}
