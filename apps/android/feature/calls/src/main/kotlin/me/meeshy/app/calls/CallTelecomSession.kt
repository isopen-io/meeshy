package me.meeshy.app.calls

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.ReceiveChannel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.model.call.TelecomConnectionState
import me.meeshy.sdk.model.call.TelecomConnectionUpdate
import me.meeshy.sdk.model.call.TelecomDisconnectCause

/** Ce que la connexion système doit faire, dans l'ordre. */
sealed interface TelecomCommand {
    /** Passer la connexion en actif (le chrono système démarre). */
    data object Activate : TelecomCommand

    data class Disconnect(val cause: TelecomDisconnectCause) : TelecomCommand
}

/**
 * La vie d'UNE connexion système, sans framework : traduit les mises à jour de
 * `TelecomCallPolicy.plan` en [TelecomCommand]s, et tient le décroché jusqu'à la connexion média
 * (hold-and-settle) pour que le chrono système ne démarre pas au décroché mais quand le son
 * circule. Un filet de [settleTimeoutMs] évite qu'un média qui n'arrive jamais laisse le système
 * sonner indéfiniment. Une reconnexion ICE ne produit aucune mise à jour : elle ne détruit rien.
 */
class CallTelecomSession(
    private val scope: CoroutineScope,
    private val isOutgoing: Boolean,
    private val settleTimeoutMs: Long = SETTLE_TIMEOUT_MS,
) {
    private val mediaUp = CompletableDeferred<Unit>()
    private val channel = Channel<TelecomCommand>(Channel.UNLIMITED)

    @Volatile
    private var systemAnswered = false

    @Volatile
    private var closed = false

    /** Les ordres à exécuter sur la connexion, jusqu'à sa clôture. */
    val commands: ReceiveChannel<TelecomCommand> get() = channel

    /** Le système vient de décrocher : l'activation passe par la fin de [holdUntilMedia]. */
    fun markSystemAnswered() {
        systemAnswered = true
    }

    /** Le système a détruit ou terminé la connexion : plus aucun ordre ne doit la viser. */
    fun markSystemEnded() {
        close()
    }

    fun onMediaConnected() {
        mediaUp.complete(Unit)
    }

    /** Suspend jusqu'à la connexion média, ou [settleTimeoutMs] au plus. */
    suspend fun holdUntilMedia() {
        withTimeoutOrNull(settleTimeoutMs) { mediaUp.await() }
    }

    fun apply(update: TelecomConnectionUpdate) {
        if (closed) return
        when (update.state) {
            TelecomConnectionState.Dialing, TelecomConnectionState.Ringing -> Unit
            TelecomConnectionState.Active -> scheduleActivation()
            TelecomConnectionState.Disconnected -> {
                channel.trySend(TelecomCommand.Disconnect(update.cause ?: TelecomDisconnectCause.Local))
                close()
            }
        }
    }

    private fun scheduleActivation() {
        scope.launch {
            holdUntilMedia()
            if (closed || (systemAnswered && !isOutgoing)) return@launch
            channel.trySend(TelecomCommand.Activate)
        }
    }

    private fun close() {
        closed = true
        channel.close()
    }

    companion object {
        const val SETTLE_TIMEOUT_MS: Long = 10_000L
    }
}
