package me.meeshy.sdk.conversation

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
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
 * Relance au démarrage la bulle de pièces [cid] dont le message n'a jamais rejoint la file alors que ses téléversements y
 * survivent (#16168) : rend `true` si la bulle repart derrière eux, `false` si rien ne lui reste.
 */
fun interface OrphanedUploadResumer {
    suspend fun resume(cid: String): Boolean
}

/**
 * Au démarrage, remet d'accord les bulles d'envoi et la file durable (arrêt du processus entre l'insertion de la
 * bulle et l'enfilage) : une bulle `SENDING` sans ligne vivante passe `FAILED` (renvoyable), une bulle `FAILED`
 * dont la ligne est repartie revient à `SENDING`. La décision est pure ([SendBootReconciliation]). Une bulle de pièces
 * dont seuls les téléversements ont rejoint la file repart derrière eux ([OrphanedUploadResumer], #16168) : sans quoi ils
 * atterriraient au retour du réseau sans qu'aucun message ne les porte, et la relance manuelle ne les retrouverait plus.
 */
@Singleton
class SendBootReconciler @Inject constructor(
    private val messageDao: MessageDao,
    private val outboxDao: OutboxDao,
    private val orphans: OrphanedUploadResumer,
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
        val resumed = plan.filter { it.to == BootSendState.FAILED && presence[it.id] == null && orphans.resume(it.id) }
        val applied = plan - resumed.toSet()
        applied.forEach { messageDao.updateSendState(it.id, it.to.name) }
        return plan.size
    }

    private fun presenceOf(state: String): OutboxPresence =
        if (state == OutboxState.EXHAUSTED.name) OutboxPresence.EXHAUSTED else OutboxPresence.LIVE

    private companion object {
        const val CHUNK = 500
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface OrphanedUploadResumerModule {
    @Binds
    fun orphanedUploadResumer(repository: MessageRepository): OrphanedUploadResumer
}
