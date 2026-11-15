package me.meeshy.app.notifications

import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.ui.input.pointer.AwaitPointerEventScope
import androidx.compose.ui.input.pointer.PointerInputChange
import androidx.compose.ui.input.pointer.changedToUp
import me.meeshy.sdk.model.NotificationBannerSwipe

/**
 * Les gestes de la bannière in-app (iOS `RootNotificationToastOverlay`) : un appui long de
 * [NotificationBannerSwipe.LONG_PRESS_MILLIS] ouvre l'aperçu ; un tirage suit le doigt (vers le haut
 * seulement, [onLift]) puis se décide par [NotificationBannerSwipe.outcome] ; le tap reste à la carte.
 *
 * Les événements sont observés en passe `Initial` et jamais consommés tant qu'aucun geste n'est
 * reconnu : le clic de la carte garde son tap, et un appui long ou un tirage reconnu l'annule. Le seuil
 * de toucher se mesure lui aussi en passe `Initial` : en passe principale, l'appui que le clic de la carte
 * vient de consommer passerait pour une annulation, et ni le tirage ni l'appui long ne naîtraient.
 */
fun Modifier.bannerGestures(
    onLift: (Float) -> Unit,
    onDismiss: () -> Unit,
    onPreview: () -> Unit,
): Modifier = composed {
    val liftTo by rememberUpdatedState(onLift)
    val dismiss by rememberUpdatedState(onDismiss)
    val preview by rememberUpdatedState(onPreview)
    pointerInput(Unit) {
        awaitEachGesture {
            val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
            var rested = false
            val slop = withTimeoutOrNull(NotificationBannerSwipe.LONG_PRESS_MILLIS) {
                awaitInitialTouchSlop(down, viewConfiguration.touchSlop)
                    .also { if (it == null) rested = true }
            }
            when {
                slop != null -> {
                    val tracker = VelocityTracker()
                    tracker.addPosition(down.uptimeMillis, down.position)
                    var translation = slop.position.y - down.position.y
                    liftTo(NotificationBannerSwipe.lift(translation))
                    while (true) {
                        val event = awaitPointerEvent(PointerEventPass.Initial)
                        val change = event.changes.firstOrNull { it.id == slop.id } ?: break
                        change.consume()
                        translation = change.position.y - down.position.y
                        tracker.addPosition(change.uptimeMillis, change.position)
                        liftTo(NotificationBannerSwipe.lift(translation))
                        if (change.changedToUp() || !change.pressed) break
                    }
                    val predicted = NotificationBannerSwipe.predictedEnd(translation, tracker.calculateVelocity().y)
                    when (NotificationBannerSwipe.outcome(translation, predicted)) {
                        NotificationBannerSwipe.Outcome.Dismiss -> dismiss()
                        NotificationBannerSwipe.Outcome.Preview -> {
                            liftTo(0f)
                            preview()
                        }
                        NotificationBannerSwipe.Outcome.None -> liftTo(0f)
                    }
                }
                rested -> Unit
                else -> {
                    preview()
                    while (true) {
                        val event = awaitPointerEvent(PointerEventPass.Initial)
                        event.changes.forEach { it.consume() }
                        if (event.changes.all { it.changedToUp() || !it.pressed }) break
                    }
                }
            }
        }
    }
}

/** Le premier mouvement du doigt [down] au-delà de [touchSlop], consommé puisqu'il ouvre un tirage ; `null` s'il se lève avant. */
private suspend fun AwaitPointerEventScope.awaitInitialTouchSlop(down: PointerInputChange, touchSlop: Float): PointerInputChange? {
    while (true) {
        val change = awaitPointerEvent(PointerEventPass.Initial).changes.firstOrNull { it.id == down.id } ?: return null
        if (change.changedToUp() || !change.pressed) return null
        if ((change.position - down.position).getDistance() > touchSlop) return change.also { it.consume() }
    }
}
