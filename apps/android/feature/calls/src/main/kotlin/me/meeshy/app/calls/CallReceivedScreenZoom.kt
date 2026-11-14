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
import androidx.compose.ui.input.pointer.AwaitPointerEventScope
import androidx.compose.ui.input.pointer.PointerEvent
import androidx.compose.ui.input.pointer.changedToUp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.input.pointer.positionChanged
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.call.group.GroupCallScreenPan
import me.meeshy.sdk.model.call.group.GroupCallSpotlight

/**
 * P15.11 — le zoom d'un écran partagé reçu, en duo comme à la une d'un groupe (miroir de iOS `CallReceivedScreenZoom`) :
 * 1× à 4× par la loi de la une ([GroupCallSpotlight.receivedScreenZoom]) ; zoomé, l'image se déplace au doigt, bornée à
 * son cadre (#17961 point 2, #17753 — [GroupCallSpotlight.screenPanClamp]). Facteur et déplacement ne sont lus que par
 * la COUCHE graphique ([callReceivedScreenZoomLayer]) : un geste ne recompose rien, le GPU seul transforme l'image.
 */
@Stable
internal class CallReceivedScreenZoom {
    var committed by mutableFloatStateOf(1f)
        private set
    var pinch by mutableFloatStateOf(1f)
        private set
    var pan by mutableStateOf(GroupCallScreenPan.Zero)
        private set

    val isZoomed: Boolean get() = committed > 1f

    /** Le zoom vivant (pincement en cours compris) dépasse 1× : le doigt qui reste déplace l'image. */
    val isPannable: Boolean get() = scale(isReceivingScreen = true) > 1f

    fun update(pinch: Float) {
        this.pinch = pinch
    }

    /** Le pincement fini devient le zoom acquis, borné par la loi. */
    fun commit() {
        committed = GroupCallSpotlight.clampedZoom(committed * pinch)
        pinch = 1f
    }

    /** Revenir à 1× recentre. */
    fun set(value: Float) {
        committed = value
        pinch = 1f
        if (value <= 1f) pan = GroupCallScreenPan.Zero
    }

    /** Un glissé, dans un cadre de [width] × [height] px : il part de la position AFFICHÉE, jamais d'au-delà de la borne. */
    fun drag(dx: Float, dy: Float, width: Float, height: Float) {
        val zoom = scale(isReceivingScreen = true)
        pan = GroupCallSpotlight.screenPanAfterDrag(GroupCallSpotlight.screenPanClamp(pan, zoom, width, height), dx, dy, zoom, width, height)
    }

    fun scale(isReceivingScreen: Boolean): Float = GroupCallSpotlight.receivedScreenZoom(committed, pinch, isReceivingScreen)

    /** Le déplacement affiché : borné au zoom vivant, donc recentré à mesure qu'on revient vers 1×. */
    fun panIn(width: Float, height: Float, isReceivingScreen: Boolean): GroupCallScreenPan =
        if (!isReceivingScreen) GroupCallScreenPan.Zero else GroupCallSpotlight.screenPanClamp(pan, scale(isReceivingScreen), width, height)
}

/** Un zoom par partage reçu : il ne survit pas au partage qui l'a fait naître. */
@Composable
internal fun rememberCallReceivedScreenZoom(isReceivingScreen: Boolean, callKey: String): CallReceivedScreenZoom =
    remember(isReceivingScreen, callKey) { CallReceivedScreenZoom() }

/**
 * L'image de l'écran reçu, agrandie et déplacée par la couche graphique (accélération matérielle) sans sortir de ses
 * bords : une seule transformation, lue au dessin.
 */
internal fun Modifier.callReceivedScreenZoomLayer(zoom: CallReceivedScreenZoom, isReceivingScreen: Boolean): Modifier =
    if (!isReceivingScreen) this else graphicsLayer {
        val factor = zoom.scale(isReceivingScreen)
        val pan = zoom.panIn(size.width, size.height, isReceivingScreen)
        scaleX = factor
        scaleY = factor
        translationX = pan.x
        translationY = pan.y
        clip = true
    }

/**
 * Les gestes de l'écran reçu : le pincement est SIMULTANÉ, il ne consomme que les mouvements à deux doigts et ne retarde
 * jamais le toucher simple qui range ou rend le chrome. Zoomé, un doigt qui passe le seuil du toucher déplace l'image
 * (#17753) : ce glissé est consommé, il n'est donc jamais un toucher et ne fait pas réduire l'appel ; relâcher un doigt
 * d'un pincement continue en déplacement. Le double toucher n'existe qu'une fois l'écran zoomé, comme celui de ma
 * caméra : il rend alors 1× et recentre, sans ranger puis rendre le chrome ; à 1×, rien n'attend un second toucher.
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
                val gesture = CallScreenGesture()
                do {
                    val event = awaitPointerEvent(PointerEventPass.Initial)
                    if (event.changes.count { it.pressed } >= 2) {
                        val change = event.calculateZoom()
                        if (change != 1f) {
                            if (!gesture.pinched) reset?.cancel()
                            gesture.scale *= change
                            gesture.pinched = true
                            zoom.update(gesture.scale)
                            event.changes.forEach { if (it.positionChanged()) it.consume() }
                        }
                    } else if (zoom.isPannable) {
                        pan(event, zoom, gesture)
                    }
                } while (event.changes.any { it.pressed && !it.changedToUp() })
                if (gesture.pinched) zoom.commit()
            }
        }
        .pointerInput(zoom, zoomed, onTap, millis) {
            detectTapGestures(
                onDoubleTap = if (zoomed) resetToOne else null,
                onTap = { onTap?.invoke() },
            )
        }
}

/** L'état d'un geste sur l'écran reçu : le pincement en cours, et la course d'un doigt avant qu'il ne devienne un glissé. */
private class CallScreenGesture {
    var scale = 1f
    var pinched = false
    var dragging = false
    var travel = Offset.Zero
}

/** Un doigt sur l'écran zoomé : au-delà du seuil du toucher, il déplace l'image et garde le geste (consommé). */
private fun AwaitPointerEventScope.pan(event: PointerEvent, zoom: CallReceivedScreenZoom, gesture: CallScreenGesture) {
    val finger = event.changes.firstOrNull { it.pressed } ?: return
    val delta = finger.positionChange()
    if (!gesture.dragging) {
        gesture.travel += delta
        gesture.dragging = gesture.travel.getDistance() > viewConfiguration.touchSlop
    }
    if (!gesture.dragging) return
    zoom.drag(delta.x, delta.y, size.width.toFloat(), size.height.toFloat())
    finger.consume()
}
