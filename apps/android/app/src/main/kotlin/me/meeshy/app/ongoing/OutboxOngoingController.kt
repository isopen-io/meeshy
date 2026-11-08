package me.meeshy.app.ongoing

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.ongoing.OutboxActivityItem
import me.meeshy.sdk.model.ongoing.OutboxActivityLaw
import me.meeshy.sdk.model.ongoing.OutboxActivitySnapshot
import me.meeshy.sdk.outbox.OutboxProgressObserver

/**
 * Exécute [OutboxActivityLaw] : la file et le réseau entrent, la notification d'envoi sort.
 *
 * Au premier plan la pastille de synchronisation parle seule (iOS : le système ne montre jamais
 * l'activité de l'app ouverte) : la loi continue de suivre la file, mais rien n'est posé ; la
 * notification apparaît dès que l'app passe en arrière-plan, si un envoi dure encore.
 * Les mises à jour sont espacées de [MIN_INTERVAL_MS] : la file bouge plus vite que l'œil.
 */
internal class OutboxOngoingController(
    private val items: Flow<List<OutboxActivityItem>>,
    private val isOffline: Flow<Boolean>,
    private val isForeground: Flow<Boolean>,
    private val sink: OngoingNotificationSink<OutboxActivitySnapshot>,
    private val wording: () -> OutboxActivityLaw.Wording,
    private val minIntervalMs: Long = MIN_INTERVAL_MS,
) {
    private var running: OutboxActivityLaw.Running? = null
    private var foreground = true

    fun start(scope: CoroutineScope): Job = scope.launch {
        launch {
            isForeground.distinctUntilChanged().collect(::onForeground)
        }
        OutboxProgressObserver.steps(items, isOffline, wording, minIntervalMs).collect(::apply)
    }

    private fun apply(step: OutboxActivityLaw.Step) {
        running = step.running
        when (val action = step.action) {
            OutboxActivityLaw.Action.None -> Unit
            is OutboxActivityLaw.Action.Start -> show(action.snapshot)
            is OutboxActivityLaw.Action.Update -> show(action.snapshot)
            is OutboxActivityLaw.Action.End -> conclude(action.snapshot)
        }
    }

    private fun show(snapshot: OutboxActivitySnapshot) {
        if (!foreground) sink.show(snapshot)
    }

    private fun conclude(snapshot: OutboxActivitySnapshot) {
        if (foreground) sink.cancel() else sink.conclude(snapshot, OutboxActivityLaw.dismissalDelayMs(snapshot.phase))
    }

    private fun onForeground(isForeground: Boolean) {
        foreground = isForeground
        if (isForeground) return sink.cancel()
        running?.snapshot?.let(sink::show)
    }

    internal companion object {
        const val MIN_INTERVAL_MS: Long = OutboxProgressObserver.MIN_INTERVAL_MS
    }
}
