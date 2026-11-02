package me.meeshy.app.navigation

import android.provider.Settings
import androidx.activity.BackEventCompat
import androidx.activity.OnBackPressedDispatcher
import androidx.activity.compose.LocalOnBackPressedDispatcherOwner
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.PointerInputScope
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import kotlin.math.abs
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import me.meeshy.ui.component.chrome.EdgeBackGate
import me.meeshy.ui.component.chrome.LocalEdgeBackGate

/**
 * Le retour interactif GLOBAL, posé UNE fois autour du `NavHost` (#13364) : un glissé depuis le bord de début
 * ferme l'écran empilé, comme sur iOS, y compris sur Android 9 qui n'a pas de geste de retour système.
 *
 * Le geste ne dessine rien lui-même : il rejoue les évènements du retour prédictif dans le
 * [OnBackPressedDispatcher] de l'activité (démarré, progression, validé ou annulé). Le `NavHost` y répond en
 * sondant la transition de pop — l'écran suit le doigt, l'écran précédent glisse légèrement dessous (voir
 * [popExitTransition]) — sans recomposer aucun écran par image : seul le décalage de la couche change. Un seul
 * chemin de retour, donc aucun double retour avec le geste système d'Android 13+ : celui-ci intercepte le bord
 * avant que ce détecteur ne le voie, et un geste annulé par le système est annulé ici aussi.
 *
 * [enabled] vient du registre ([NavBackChrome.edgeSwipeBackEnabled]) ; un écran qui porte ses propres glissés
 * depuis le bord le ferme avec `DisableEdgeBackWhile`.
 */
@Composable
internal fun EdgeSwipeBackHost(
    enabled: Boolean,
    canGoBack: () -> Boolean,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val dispatcher = LocalOnBackPressedDispatcherOwner.current?.onBackPressedDispatcher
    val gate = remember { EdgeBackGate() }
    val isRtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val resolver = LocalContext.current.contentResolver
    val scope = rememberCoroutineScope()
    val enabledState = rememberUpdatedState(enabled)
    val canGoBackState = rememberUpdatedState(canGoBack)
    val settling = remember { SettlingFlag() }
    Box(
        modifier = modifier.pointerInput(dispatcher, isRtl) {
            if (dispatcher == null) return@pointerInput
            detectEdgeBack(
                dispatcher = dispatcher,
                isRtl = isRtl,
                scope = scope,
                settling = settling,
                armed = { enabledState.value && gate.isOpen && canGoBackState.value() && dispatcher.hasEnabledCallbacks() },
                reducedMotion = {
                    Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
                },
            )
        },
    ) {
        CompositionLocalProvider(LocalEdgeBackGate provides gate, content = content)
    }
}

private class SettlingFlag {
    var active: Boolean = false
}

private suspend fun PointerInputScope.detectEdgeBack(
    dispatcher: OnBackPressedDispatcher,
    isRtl: Boolean,
    scope: CoroutineScope,
    settling: SettlingFlag,
    armed: () -> Boolean,
    reducedMotion: () -> Boolean,
) {
    val edgePx = EdgeBackGesture.EDGE_DP * density
    val slopPx = viewConfiguration.touchSlop
    val edge = if (isRtl) BackEventCompat.EDGE_RIGHT else BackEventCompat.EDGE_LEFT
    fun event(x: Float, y: Float, progress: Float) = BackEventCompat(x, y, progress, edge)

    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
        val widthPx = size.width.toFloat()
        if (settling.active || !EdgeBackGesture.beginsAtEdge(down.position.x, widthPx, edgePx, isRtl) || !armed()) {
            return@awaitEachGesture
        }
        val reduced = reducedMotion()
        val tracker = VelocityTracker().also { it.addPosition(down.uptimeMillis, down.position) }
        var following = false
        var progress = 0f
        var lastX = down.position.x
        var lastY = down.position.y
        var finished = false
        try {
            while (true) {
                val change = awaitPointerEvent(PointerEventPass.Initial).changes.firstOrNull { it.id == down.id } ?: break
                tracker.addPosition(change.uptimeMillis, change.position)
                lastX = change.position.x
                lastY = change.position.y
                val travel = EdgeBackGesture.travel(down.position.x, lastX, isRtl)
                if (!following) {
                    val vertical = abs(lastY - down.position.y)
                    if (EdgeBackGesture.isForeign(travel, vertical, slopPx)) return@awaitEachGesture
                    if (EdgeBackGesture.hasStarted(travel, slopPx)) {
                        following = true
                        if (!reduced) dispatcher.dispatchOnBackStarted(event(lastX, lastY, 0f))
                    }
                }
                if (following) {
                    change.consume()
                    progress = EdgeBackGesture.progress(travel, widthPx)
                    if (!reduced) dispatcher.dispatchOnBackProgressed(event(lastX, lastY, progress))
                }
                if (!change.pressed) {
                    finished = true
                    break
                }
            }
            if (!following) return@awaitEachGesture
            val widthsPerSecond = (if (isRtl) -1f else 1f) * tracker.calculateVelocity().x / widthPx
            if (EdgeBackGesture.shouldCommit(progress, widthsPerSecond)) {
                if (reduced) dispatcher.dispatchOnBackStarted(event(lastX, lastY, progress))
                dispatcher.onBackPressed()
            } else {
                settleBack(scope, settling, dispatcher, from = progress, reduced = reduced) { event(lastX, lastY, it) }
            }
            finished = true
        } finally {
            if (following && !finished) {
                settleBack(scope, settling, dispatcher, from = progress, reduced = reduced) { event(lastX, lastY, it) }
            }
        }
    }
}

/** L'annulation revient au bord par un ressort (pas de saut), puis rend la main au `NavHost` ; sans animations, elle est immédiate. */
private fun settleBack(
    scope: CoroutineScope,
    settling: SettlingFlag,
    dispatcher: OnBackPressedDispatcher,
    from: Float,
    reduced: Boolean,
    eventAt: (Float) -> BackEventCompat,
) {
    if (reduced) return
    settling.active = true
    scope.launch {
        try {
            Animatable(from).animateTo(
                targetValue = 0f,
                animationSpec = spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessMedium),
            ) { dispatcher.dispatchOnBackProgressed(eventAt(value)) }
        } finally {
            dispatcher.dispatchOnBackCancelled()
            settling.active = false
        }
    }
}
