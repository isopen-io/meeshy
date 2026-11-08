package me.meeshy.app.chat

import androidx.compose.animation.core.FloatExponentialDecaySpec
import androidx.compose.foundation.interaction.DragInteraction
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.unit.Velocity
import kotlin.math.abs
import me.meeshy.sdk.model.reading.focal.FocalChromeReturn
import me.meeshy.sdk.model.reading.focal.KeyboardFirstScroll

/**
 * Le clavier part D'ABORD (iOS `KeyboardFirstScrollGate`) et le chrome du fil (en-tête, barre de
 * saisie) se replie pendant le geste, revient doigt levé quand la décélération restante est
 * <= [FocalChromeReturn.RETURN_DISTANCE]. Un geste COMMENCÉ clavier ouvert ne replie rien : il ne
 * fait que fermer le clavier. Les positions sont celles de la liste inversée : plus grand = plus ancien.
 */
@Stable
internal class ThreadChromeScroll {
    /** Posé par l'hôte : ferme le clavier sur l'animation système. */
    var dismissKeyboard: () -> Unit = {}
    var keyboardOpen: Boolean by mutableStateOf(false)
    var isTracking: Boolean by mutableStateOf(false)
        private set
    var isDecelerating: Boolean by mutableStateOf(false)
        private set
    private var flingRemaining: Float? by mutableStateOf(null)
    private var openAtGestureStart: Boolean by mutableStateOf(false)
    private var gestureStart: Long = 0L
    private var dismissedThisGesture: Boolean = false
    private var flingTarget: Float = 0f
    private var flingTravelled: Float = 0f

    val chromeMayCollapse: Boolean
        get() = KeyboardFirstScroll.chromeMayCollapse(openAtGestureStart, keyboardOpen)

    val chromeHidden: Boolean by derivedStateOf {
        FocalChromeReturn.isHidden(isTracking, isDecelerating, flingRemaining) && chromeMayCollapse
    }

    fun gestureBegan(position: Long) {
        openAtGestureStart = keyboardOpen
        gestureStart = position
        dismissedThisGesture = false
        isTracking = true
        isDecelerating = false
        flingRemaining = null
    }

    /** Une image de défilement sous le doigt : vers les anciens, clavier levé ⇒ il se ferme, une fois. */
    fun noteScroll(position: Long) {
        if (!isTracking || dismissedThisGesture) return
        if (!KeyboardFirstScroll.dismissesKeyboard(keyboardOpen, towardOlder = position > gestureStart)) return
        dismissedThisGesture = true
        keyboardOpen = false
        dismissKeyboard()
    }

    fun gestureEnded() {
        isTracking = false
    }

    fun flingStarted(velocityY: Float) {
        flingTarget = abs(FloatExponentialDecaySpec().getTargetValue(0f, velocityY))
        flingTravelled = 0f
        isDecelerating = abs(velocityY) > 0f
        flingRemaining = flingTarget.takeIf { isDecelerating }
    }

    fun flingConsumed(deltaY: Float) {
        if (!isDecelerating) return
        flingTravelled += abs(deltaY)
        flingRemaining = (flingTarget - flingTravelled).coerceAtLeast(0f)
    }

    fun flingEnded() {
        isDecelerating = false
        flingRemaining = null
    }
}

private fun LazyListState.scrollPosition(): Long =
    firstVisibleItemIndex.toLong() * POSITION_ITEM_STRIDE + firstVisibleItemScrollOffset

private const val POSITION_ITEM_STRIDE = 100_000L

/**
 * Branche [scroll] sur la liste : doigt posé/levé (interactions de glissé), position à chaque
 * image, clavier levé (insets IME). Rend le connecteur qui lit l'élan pour la distance restante.
 */
@Composable
internal fun rememberKeyboardFirstScrollConnection(listState: LazyListState, scroll: ThreadChromeScroll): NestedScrollConnection {
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    scroll.dismissKeyboard = { focusManager.clearFocus(force = true); keyboardController?.hide() }
    val imeOpen = WindowInsets.ime.getBottom(LocalDensity.current) > 0
    LaunchedEffect(imeOpen) { scroll.keyboardOpen = imeOpen }
    LaunchedEffect(listState, scroll) {
        listState.interactionSource.interactions.collect { interaction ->
            when (interaction) {
                is DragInteraction.Start -> scroll.gestureBegan(listState.scrollPosition())
                is DragInteraction.Stop, is DragInteraction.Cancel -> scroll.gestureEnded()
            }
        }
    }
    LaunchedEffect(listState, scroll) {
        snapshotFlow { listState.scrollPosition() }.collect { scroll.noteScroll(it) }
    }
    val current by rememberUpdatedState(scroll)
    return remember(listState) {
        object : NestedScrollConnection {
            override suspend fun onPreFling(available: Velocity): Velocity {
                current.gestureEnded()
                current.flingStarted(available.y)
                return Velocity.Zero
            }

            override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
                if (source == NestedScrollSource.SideEffect) current.flingConsumed(consumed.y)
                return Offset.Zero
            }

            override suspend fun onPostFling(consumed: Velocity, available: Velocity): Velocity {
                current.flingEnded()
                return Velocity.Zero
            }
        }
    }
}
