package me.meeshy.sdk.conversation

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.PendingEdit
import me.meeshy.sdk.model.PendingReaction
import me.meeshy.sdk.model.PendingRowEventBuffer
import me.meeshy.sdk.model.PendingRowEvents
import me.meeshy.sdk.model.PendingTombstone

/**
 * La mémoire PARTAGÉE des événements arrivés avant leur message (miroir de `pendingRowEvents`
 * dans `MessagePersistenceActor`, iOS) : les écrivains d'événements (modification, réactions,
 * suppression) y déposent ce qu'ils n'ont pas pu poser faute de ligne, et la porte d'ingestion
 * ([MessageIngestPipeline]) le rejoue quand la ligne arrive. Les règles — bornes, ordre de rejeu,
 * suppression gagnante — vivent dans `:core:model` ([PendingRowEventBuffer]) ; cette classe n'y
 * ajoute que le verrou et l'horloge.
 */
@Singleton
class MessageEventBuffer @Inject constructor(private val clock: CacheClock) {
    private val lock = Any()
    private val buffer = PendingRowEventBuffer()

    fun rememberEdit(id: String, edit: PendingEdit) =
        synchronized(lock) { buffer.rememberEdit(id, clock.nowMillis(), edit) }

    fun rememberReaction(id: String, reaction: PendingReaction) =
        synchronized(lock) { buffer.rememberReaction(id, clock.nowMillis(), reaction) }

    fun rememberTombstone(id: String, tombstone: PendingTombstone) =
        synchronized(lock) { buffer.rememberTombstone(id, clock.nowMillis(), tombstone) }

    /**
     * Retire et rend ce qui attendait l'un des [ids] (identifiant serveur ou local d'une même
     * ligne). Deux dépôts sous deux clés sont réunis : la modification la plus récente, les
     * réactions à la suite, la suppression si l'un des deux en porte une.
     */
    fun take(ids: Collection<String>): PendingRowEvents? = synchronized(lock) {
        val now = clock.nowMillis()
        val found = ids.distinct().mapNotNull { buffer.take(it, now) }
        when (found.size) {
            0 -> null
            1 -> found.single()
            else -> found.reduce { first, second ->
                first.copy(
                    edit = second.edit ?: first.edit,
                    reactions = first.reactions + second.reactions,
                    tombstone = first.tombstone ?: second.tombstone,
                )
            }
        }
    }

    /** Fin de session : rien de ce qui attendait sous un compte ne se rejoue sous le suivant. */
    fun clear() = synchronized(lock) { buffer.clear() }
}
