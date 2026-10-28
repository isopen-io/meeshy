package me.meeshy.sdk.mediahub

import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.mediahub.ConversationMediaHubRules
import me.meeshy.sdk.model.mediahub.ConversationMediaKind
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.session.commitOrWrite

/** Ce que l'index garde d'un genre : les porteurs déjà vus et si le serveur a dit « c'est tout ». */
data class MediaHubIndexEntry(val carriers: List<ApiMessage>, val isComplete: Boolean)

/**
 * L'index des médias vus, par conversation et par genre — le cache d'abord de l'écran (ouvrir un genre déjà vu se
 * peint sans réseau, la tête se revalide en silence). UNIT les porteurs sans jamais écraser. Propre au compte
 * connecté ([PerAccountCache]) : un second compte n'ouvre jamais sur les médias du premier. Mémoire de processus,
 * bornée à [MAX_CARRIERS] porteurs par genre.
 */
@Singleton
class ConversationMediaHubIndex @Inject constructor(
    private val fence: AccountFence?,
) : PerAccountCache {
    private val entries = ConcurrentHashMap<String, MediaHubIndexEntry>()

    fun read(conversationId: String, kind: ConversationMediaKind): MediaHubIndexEntry? =
        entries[kind.indexKey(conversationId)]

    /** Le compte auquel appartient une requête qui part MAINTENANT (#13560) ; `null` sans garde. */
    fun ticket(): AccountTicket? = fence?.ticket()

    suspend fun merge(
        conversationId: String,
        kind: ConversationMediaKind,
        carriers: List<ApiMessage>,
        complete: Boolean,
        ticket: AccountTicket?,
    ) {
        fence.commitOrWrite(ticket) {
            entries.compute(kind.indexKey(conversationId)) { _, current ->
                val union = ConversationMediaHubRules.union(current?.carriers.orEmpty(), carriers).take(MAX_CARRIERS)
                MediaHubIndexEntry(union, (current?.isComplete == true) || complete)
            }
        }
    }

    override suspend fun clear() = entries.clear()

    companion object {
        const val MAX_CARRIERS: Int = 600
    }
}
