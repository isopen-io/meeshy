package me.meeshy.sdk.conversation

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.core.database.dao.OutboxDao
import me.meeshy.sdk.model.send.BootSendRow
import me.meeshy.sdk.model.send.BootSendState
import me.meeshy.sdk.model.send.OutboxPresence
import me.meeshy.sdk.model.send.SendBootReconciliation
import me.meeshy.sdk.outbox.OutboxState

/**
 * Au démarrage, remet d'accord les bulles d'envoi et la file durable (arrêt du processus entre l'insertion de la
 * bulle et l'enfilage) : une bulle `SENDING` sans ligne vivante passe `FAILED` (renvoyable), une bulle `FAILED`
 * dont la ligne est repartie revient à `SENDING`. La décision est pure ([SendBootReconciliation]).
 */
@Singleton
class SendBootReconciler @Inject constructor(
    private val messageDao: MessageDao,
    private val outboxDao: OutboxDao,
) {

    /** Rend le nombre de bulles dont l'état a changé. */
    suspend fun reconcile(): Int {
        val rows = BootSendState.entries.flatMap { state ->
            messageDao.idsInSendState(state.name).map { BootSendRow(it, state) }
        }
        if (rows.isEmpty()) return 0
        val presence = rows.map { it.id }.chunked(CHUNK).flatMap { outboxDao.findAll(it) }
            .associate { it.cmid to presenceOf(it.state) }
        val plan = SendBootReconciliation.plan(rows) { presence[it] ?: OutboxPresence.ABSENT }
        plan.forEach { messageDao.updateSendState(it.id, it.to.name) }
        return plan.size
    }

    private fun presenceOf(state: String): OutboxPresence =
        if (state == OutboxState.EXHAUSTED.name) OutboxPresence.EXHAUSTED else OutboxPresence.LIVE

    private companion object {
        const val CHUNK = 500
    }
}
