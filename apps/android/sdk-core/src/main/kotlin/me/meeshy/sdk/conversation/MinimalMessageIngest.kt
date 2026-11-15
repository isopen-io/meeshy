package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.MinimalMessageSeed

/**
 * Le chemin « donnée minimale » d'un data-message FCM — miroir de `IncomingBatchReconciler`
 * (iOS), resserré : la graine [MinimalMessageSeed] ne s'insère que si AUCUNE ligne ne porte déjà
 * ce message (par identifiant, colonne `serverId` ou pont `cid_`). Elle n'écrase donc jamais un
 * payload riche arrivé par REST ou par la socket ; à l'inverse, le REST suivant la complète par
 * la fusion de [MessageIngestPipeline] (pièces, expéditeur, citation, type).
 */
@Singleton
class MinimalMessageIngest @Inject constructor(
    private val database: MeeshyDatabase,
    private val clock: CacheClock,
    private val signal: ConversationRefreshSignal,
) {

    /** Insère [seed] s'il est absent ; rend `true` quand une ligne a été écrite. */
    suspend fun ingest(seed: MinimalMessageSeed): Boolean {
        val inserted = database.withTransaction {
            if (MessageIdReconciliation.locate(database, seed.id) != null) return@withTransaction false
            val row = MessageEntityFactory.cached(seed.toApiMessage(), cachedAt = clock.nowMillis())
            database.messageDao().upsertAll(listOf(row))
            true
        }
        if (inserted) signal.notify(setOf(seed.conversationId))
        return inserted
    }
}
