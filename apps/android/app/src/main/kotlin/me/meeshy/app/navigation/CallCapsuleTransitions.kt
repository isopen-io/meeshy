package me.meeshy.app.navigation

import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import me.meeshy.sdk.model.call.CallShareCapsuleMotion

/**
 * #17767 — l'appel se contracte vers la capsule de partage et s'y redéploie (iOS `CallShareCapsuleMotion`) : un fondu et
 * une mise à l'échelle courts, en `graphicsLayer` donc sans recomposition par image. « Réduire les animations » ne
 * garde que le fondu. Un seul site : la navigation (appel plein écran) et l'apparition de la capsule le partagent.
 */
internal object CallCapsuleTransitions {

    /** Ce qui ENTRE : l'appel qui se déploie depuis la capsule, ou la capsule qui apparaît. */
    fun enter(reduceMotion: Boolean): EnterTransition {
        val millis = CallShareCapsuleMotion.windowFadeMillis(reduceMotion, appearing = true)
        val fade = fadeIn(tween(millis))
        return if (reduceMotion) fade else fade + scaleIn(tween(millis), initialScale = CallShareCapsuleMotion.startScale(reduceMotion))
    }

    /** Ce qui SORT : l'appel qui se contracte vers la capsule, ou la capsule qui s'efface. */
    fun exit(reduceMotion: Boolean): ExitTransition {
        val millis = CallShareCapsuleMotion.windowFadeMillis(reduceMotion, appearing = false)
        val fade = fadeOut(tween(millis))
        return if (reduceMotion) fade else fade + scaleOut(tween(millis), targetScale = CallShareCapsuleMotion.startScale(reduceMotion))
    }

    /** L'écran qui reste dessous pendant le passage : il s'efface ou revient en fondu, sans échelle. */
    fun underlayEnter(reduceMotion: Boolean): EnterTransition =
        fadeIn(tween(CallShareCapsuleMotion.windowFadeMillis(reduceMotion, appearing = true)))

    fun underlayExit(reduceMotion: Boolean): ExitTransition =
        fadeOut(tween(CallShareCapsuleMotion.windowFadeMillis(reduceMotion, appearing = false)))
}
