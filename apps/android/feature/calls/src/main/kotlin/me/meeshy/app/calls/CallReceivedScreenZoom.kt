package me.meeshy.app.calls

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.changedToUp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.call.group.GroupCallSpotlight

/**
 * P15.11 — le zoom de l'écran que l'autre partage en duo (miroir de iOS `CallReceivedScreenZoom`) : 1× à 4× par la loi
 * de la une du groupe ([GroupCallSpotlight.receivedScreenZoom]). Le facteur n'est lu que par la COUCHE graphique
 * ([callReceivedScreenZoomLayer]) : un pincement ne recompose rien, le GPU seul transforme l'image.
 */
@Stable
internal class CallReceivedScreenZoom {
    var committed by mutableFloatStateOf(1f)
        private set
    var pinch by mutableFloatStateOf(1f)
        private set

    val isZoomed: Boolean get() = committed > 1f

    fun update(pinch: Float) {
        this.pinch = pinch
    }

    /** Le pincement fini devient le zoom acquis, borné par la loi. */
    fun commit() {
        committed = GroupCallSpotlight.clampedZoom(committed * pinch)
        pinch = 1f
    }

    fun set(value: Float) {
        committed = value
        pinch = 1f
    }

    fun scale(isReceivingScreen: Boolean): Float = GroupCallSpotlight.receivedScreenZoom(committed, pinch, isReceivingScreen)
}

/** Un zoom par partage reçu : il ne survit pas au partage qui l'a fait naître. */
@Composable
internal fun rememberCallReceivedScreenZoom(isReceivingScreen: Boolean, callKey: String): CallReceivedScreenZoom =
    remember(isReceivingScreen, callKey) { CallReceivedScreenZoom() }

/** L'image de l'écran reçu, agrandie par la couche graphique (accélération matérielle) sans sortir de ses bords. */
internal fun Modifier.callReceivedScreenZoomLayer(zoom: CallReceivedScreenZoom, isReceivingScreen: Boolean): Modifier =
    if (!isReceivingScreen) this else graphicsLayer {
        val factor = zoom.scale(isReceivingScreen)
        scaleX = factor
        scaleY = factor
        clip = true
    }

/**
 * Les gestes de l'écran reçu : le pincement est SIMULTANÉ, il ne consomme que les mouvements à deux doigts et ne retarde
 * jamais le toucher simple qui range ou rend le chrome. Le double toucher n'existe qu'une fois l'écran zoomé, comme celui
 * de ma caméra : il rend alors 1× sans ranger puis rendre le chrome ; à 1×, rien n'attend un second toucher.
 * « Réduire les animations » raccourcit le retour à un fondu court.
 */
@Composable
internal fun Modifier.callReceivedScreenZoomGestures(
    zoom: CallReceivedScreenZoom,
    reduceMotion: Boolean,
    onTap: (() -> Unit)?,
): Modifier {
    val scope = rememberCoroutineScope()
    var reset by remember { mutableStateOf<Job?>(null) }
    val zoomed by remember(zoom) { derivedStateOf { zoom.isZoomed } }
    val millis = GroupCallSpotlight.receivedScreenResetMillis(reduceMotion)
    val resetToOne: (Offset) -> Unit = {
        reset?.cancel()
        reset = scope.launch {
            animate(zoom.committed, 1f, animationSpec = tween(millis, easing = FastOutSlowInEasing)) { value, _ -> zoom.set(value) }
        }
    }
    return this
        .pointerInput(zoom) {
            awaitEachGesture {
                awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                var scale = 1f
                var pinched = false
                do {
                    val event = awaitPointerEvent(PointerEventPass.Initial)
                    if (event.changes.count { it.pressed } >= 2) {
                        val change = event.calculateZoom()
                        if (change != 1f) {
                            if (!pinched) reset?.cancel()
                            scale *= change
                            pinched = true
                            zoom.update(scale)
                            event.changes.forEach { if (it.positionChanged()) it.consume() }
                        }
                    }
                } while (event.changes.any { it.pressed && !it.changedToUp() })
                if (pinched) zoom.commit()
            }
        }
        .pointerInput(zoom, zoomed, onTap, millis) {
            detectTapGestures(
                onDoubleTap = if (zoomed) resetToOne else null,
                onTap = { onTap?.invoke() },
            )
        }
}
