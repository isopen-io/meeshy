package me.meeshy.app.calls

import kotlinx.coroutines.flow.emptyFlow
import me.meeshy.sdk.model.call.group.GroupCallTitleWording
import me.meeshy.sdk.socket.CallSignalManager

/** Les mots du nom d'un appel de groupe, fixes, pour les témoins du [CallViewModel]. */
internal val testGroupTitleWording = GroupCallTitleWordingSource {
    GroupCallTitleWording(unknownMember = "Participant", everyone = "Participants") { shown, count -> "$shown +$count" }
}

/** Un renouvellement TURN dont l'échéance ne tombe jamais : les témoins qui ne parlent pas de TURN n'en voient rien. */
internal fun silentTurnCredentials(signals: CallSignalManager) =
    CallTurnCredentialsController(signals, CallTurnRefreshTimer { emptyFlow() })

/** Une attente TURN tenue à la main : [armed] dit chaque délai demandé, [fire] fait tomber la dernière attente vivante de [delayMs]. */
internal class ManualTurnTimer : CallTurnRefreshTimer {
    val armed = mutableListOf<Long>()
    private val pending = mutableListOf<Pair<Long, kotlinx.coroutines.CompletableDeferred<Unit>>>()

    val live: List<Long> get() = pending.map { it.first }

    override fun after(delayMs: Long): kotlinx.coroutines.flow.Flow<Unit> = kotlinx.coroutines.flow.flow {
        val entry = delayMs to kotlinx.coroutines.CompletableDeferred<Unit>()
        armed += delayMs
        pending += entry
        try {
            entry.second.await()
        } finally {
            pending.remove(entry)
        }
        emit(Unit)
    }

    fun fire(delayMs: Long) {
        pending.last { it.first == delayMs }.second.complete(Unit)
    }
}
