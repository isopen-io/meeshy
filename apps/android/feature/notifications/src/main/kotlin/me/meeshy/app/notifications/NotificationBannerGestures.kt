package me.meeshy.app.notifications

import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.awaitTouchSlopOrCancellation
import androidx.compose.ui.input.pointer.changedToUp
import me.meeshy.sdk.model.NotificationBannerSwipe

/**
 * Les gestes de la bannière in-app (iOS `RootNotificationToastOverlay`) : un appui long de
 * [NotificationBannerSwipe.LONG_PRESS_MILLIS] ouvre l'aperçu ; un tirage suit le doigt (vers le haut
 * seulement, [onLift]) puis se décide par [NotificationBannerSwipe.outcome] ; le tap reste à la carte.
 *
 * Les événements sont observés en passe `Initial` et jamais consommés tant qu'aucun geste n'est
 * reconnu : le clic de la carte garde son tap, et un appui long ou un tirage reconnu l'annule.
 */
fun Modifier.bannerGestures(
    onLift: (Float) -> Unit,
    onDismiss: () -> Unit,
    onPreview: () -> Unit,
): Modifier = pointerInput(Unit) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
        var rested = false
        val slop = withTimeoutOrNull(NotificationBannerSwipe.LONG_PRESS_MILLIS) {
            awaitTouchSlopOrCancellation(down.id) { _, _ -> }
                .also { if (it == null) rested = true }
        }
        when {
            slop != null -> {
                val tracker = VelocityTracker()
                tracker.addPosition(down.uptimeMillis, down.position)
                var translation = slop.position.y - down.position.y
                onLift(NotificationBannerSwipe.lift(translation))
                while (true) {
                    val event = awaitPointerEvent(PointerEventPass.Initial)
                    val change = event.changes.firstOrNull { it.id == slop.id } ?: break
                    change.consume()
                    translation = change.position.y - down.position.y
                    tracker.addPosition(change.uptimeMillis, change.position)
                    onLift(NotificationBannerSwipe.lift(translation))
                    if (change.changedToUp() || !change.pressed) break
                }
                val predicted = NotificationBannerSwipe.predictedEnd(translation, tracker.calculateVelocity().y)
                when (NotificationBannerSwipe.outcome(translation, predicted)) {
                    NotificationBannerSwipe.Outcome.Dismiss -> onDismiss()
                    NotificationBannerSwipe.Outcome.Preview -> {
                        onLift(0f)
                        onPreview()
                    }
                    NotificationBannerSwipe.Outcome.None -> onLift(0f)
                }
            }
            rested -> Unit
            else -> {
                onPreview()
                while (true) {
                    val event = awaitPointerEvent(PointerEventPass.Initial)
                    event.changes.forEach { it.consume() }
                    if (event.changes.all { it.changedToUp() || !it.pressed }) break
                }
            }
        }
    }
}
