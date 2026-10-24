package me.meeshy.ui.component.chrome

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import kotlinx.coroutines.delay

/**
 * Generic scroll-quieting visibility rule — not specific to [CollapsibleHeader]: any
 * host that wants to hide chrome while the user is actively scrolling and reveal it
 * again once the list has settled can reuse this. Hidden the entire time scrolling is
 * in progress, then visible again once the list has been still for
 * [STILLNESS_THRESHOLD_MS]. The caller applies the [FADE_DURATION_MS] cross-fade
 * itself (e.g. via `animateFloatAsState`) — this object only decides the boolean.
 *
 * Miroir de `ScrollMotion` (ScrollMotionVisibility.swift) : « une vue en mouvement ne montre
 * pas ses boutons d'action », et un bouton efface ne repond plus — le doigt qui freine la
 * liste atterrit exactement la ou il se tenait.
 */
public object ScrollMotionVisibility {
    public const val STILLNESS_THRESHOLD_MS: Long = 160L
    public const val FADE_DURATION_MS: Int = 220

    /**
     * [quietMillis] is the time elapsed since the list last stopped scrolling, as
     * measured by the host (`0` for as long as it is still scrolling).
     */
    public fun isVisible(isScrolling: Boolean, quietMillis: Long): Boolean =
        !isScrolling && quietMillis >= STILLNESS_THRESHOLD_MS

    public fun opacity(isMoving: Boolean): Float = if (isMoving) 0f else 1f

    /** Un bouton efface ne doit plus repondre. */
    public fun allowsHitTesting(isMoving: Boolean): Boolean = !isMoving
}

/**
 * `true` tant que la vue englobante defile (miroir de `isScrollMotionActive`). Defaut `false` :
 * hors de toute source, les boutons sont au repos, donc visibles.
 */
public val LocalScrollMotionActive: ProvidableCompositionLocal<Boolean> = compositionLocalOf { false }

/**
 * La SOURCE : derive le mouvement de `isScrollInProgress` d'une liste, et ne declare l'arret
 * qu'apres [ScrollMotionVisibility.STILLNESS_THRESHOLD_MS] de silence (sinon les boutons
 * clignoteraient entre deux impulsions). A publier dans [LocalScrollMotionActive].
 */
@Composable
public fun rememberScrollMotionActive(isScrollInProgress: Boolean): Boolean {
    var moving by remember { mutableStateOf(false) }
    LaunchedEffect(isScrollInProgress) {
        if (isScrollInProgress) {
            moving = true
        } else if (moving) {
            delay(ScrollMotionVisibility.STILLNESS_THRESHOLD_MS)
            moving = false
        }
    }
    return moving
}

/**
 * Le CONSOMMATEUR : efface ce bouton (fondu de [ScrollMotionVisibility.FADE_DURATION_MS]) et
 * coupe son toucher tant que [isMoving], puis le ramene a l'arret.
 */
@Composable
public fun Modifier.hiddenWhileScrolling(isMoving: Boolean = LocalScrollMotionActive.current): Modifier {
    val alpha by animateFloatAsState(
        targetValue = ScrollMotionVisibility.opacity(isMoving),
        animationSpec = tween(ScrollMotionVisibility.FADE_DURATION_MS),
        label = "scroll-motion-fade",
    )
    val faded = this.graphicsLayer { this.alpha = alpha }
    if (ScrollMotionVisibility.allowsHitTesting(isMoving)) return faded
    return faded.pointerInput(Unit) {
        awaitPointerEventScope {
            while (true) {
                awaitPointerEvent(PointerEventPass.Initial).changes.forEach { it.consume() }
            }
        }
    }
}
