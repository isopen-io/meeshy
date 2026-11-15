package me.meeshy.app.notifications

import androidx.compose.animation.core.EaseInOut
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.tween
import androidx.compose.ui.unit.IntOffset

/**
 * Le mouvement de la liste de la cloche, miroir de `NotificationListScreen` (iOS : `.easeInOut(duration: 0.25)` sur
 * les ids). Sous « Réduire les animations », les rangées se fondent sans glisser et le retour en haut est immédiat.
 */
internal object NotificationListMotion {
    const val ROW_MILLIS: Int = 250

    fun <T> rowFade(): FiniteAnimationSpec<T> = tween(ROW_MILLIS, easing = EaseInOut)

    fun rowPlacement(reduceMotion: Boolean): FiniteAnimationSpec<IntOffset>? =
        if (reduceMotion) null else tween(ROW_MILLIS, easing = EaseInOut)

    fun animatesScrollToTop(reduceMotion: Boolean): Boolean = !reduceMotion
}
