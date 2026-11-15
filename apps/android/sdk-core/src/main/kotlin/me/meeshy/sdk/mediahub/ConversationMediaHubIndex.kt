package me.meeshy.sdk.mediahub

import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.mediahub.ConversationMediaHubRules
import me.meeshy.sdk.model.mediahub.ConversationMediaKind
import me.meeshy.sdk.model.mediahub.ConversationMediaRules
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.session.commitOrWrite
import timber.log.Timber

/** Ce que l'index garde d'un genre : les porteurs déjà vus et si le serveur a dit « c'est tout ». */
data class MediaHubIndexEntry(val carriers: List<ApiMessage>, val isComplete: Boolean)

/**
 * L'index des médias vus, par conversation et par genre — le cache d'abord de l'écran (ouvrir un genre déjà vu se
 * peint sans réseau, la tête se revalide en silence). UNIT les porteurs sans jamais écraser, SANS plafond. Deux
 * niveaux : la mémoire du processus (lecture synchrone) et le disque ([ConversationMediaPersistence], six mois,
 * relu à froid par [load]). Propre au compte connecté ([PerAccountCache]) : un second compte n'ouvre jamais sur les
 * médias du premier. Un échec d'écriture disque ne perd jamais la mise à jour en mémoire.
 */
@Singleton
class ConversationMediaHubIndex @Inject constructor(
    private val fence: AccountFence?,
    private val persistence: ConversationMediaPersistence,
) : PerAccountCache {

    constructor(fence: AccountFence?) : this(fence, ConversationMediaPersistence.None)

    private val entries = ConcurrentHashMap<String, MediaHubIndexEntry>()

    fun read(conversationId: String, kind: ConversationMediaKind): MediaHubIndexEntry? =
        entries[kind.indexKey(conversationId)]

    /** La mémoire d'abord, puis le disque (qui réchauffe la mémoire) : l'index d'un genre jamais chargé depuis le démarrage. */
    suspend fun load(conversationId: String, kind: ConversationMediaKind): MediaHubIndexEntry? {
        read(conversationId, kind)?.let { return it }
        val stored = guarded { persistence.read(conversationId, kind) } ?: return null
        return entries.putIfAbsent(kind.indexKey(conversationId), stored) ?: stored
    }

    /** Le compte auquel appartient une requête qui part MAINTENANT (#13560) ; `null` sans garde. */
    fun ticket(): AccountTicket? = fence?.ticket()

    suspend fun merge(
        conversationId: String,
        kind: ConversationMediaKind,
        carriers: List<ApiMessage>,
        complete: Boolean,
        ticket: AccountTicket?,
    ) {
        val known = load(conversationId, kind)
        fence.commitOrWrite(ticket) {
            val merged = entries.compute(kind.indexKey(conversationId)) { _, current ->
                val base = current ?: known
                MediaHubIndexEntry(
                    ConversationMediaHubRules.union(base?.carriers.orEmpty(), carriers),
                    (base?.isComplete == true) || complete,
                )
            }
            merged?.let { guarded { persistence.write(conversationId, kind, it) } }
        }
    }

    /**
     * Une pièce supprimée (`attachment:deleted`, #13609) quitte les porteurs déjà vus de CETTE conversation, sur
     * TOUS les genres : sans ce retrait, l'union qui n'écrase jamais la garderait, même après revalidation.
     */
    suspend fun forgetAttachment(conversationId: String, messageId: String, attachmentId: String, ticket: AccountTicket?) =
        rewrite(conversationId, ticket) { kind, carriers ->
            ConversationMediaRules.droppingAttachment(carriers, kind, messageId, attachmentId)
        }

    /** Un message supprimé ou expiré quitte TOUS les genres : jamais un contenu fantôme dans l'onglet Documents. */
    suspend fun forgetMessage(conversationId: String, messageId: String, ticket: AccountTicket?) =
        rewrite(conversationId, ticket) { _, carriers -> ConversationMediaRules.dropping(carriers, messageId) }

    /** Sortie de conversation, historique effacé, suppression : tous les genres, mémoire et disque. */
    suspend fun invalidateConversation(conversationId: String, ticket: AccountTicket? = null) {
        fence.commitOrWrite(ticket) {
            ConversationMediaKind.entries.forEach { entries.remove(it.indexKey(conversationId)) }
            guarded { persistence.invalidate(conversationId) }
        }
    }

    private suspend fun rewrite(
        conversationId: String,
        ticket: AccountTicket?,
        transform: (ConversationMediaKind, List<ApiMessage>) -> List<ApiMessage>,
    ) {
        val loaded = ConversationMediaKind.entries.mapNotNull { kind -> load(conversationId, kind)?.let { kind to it } }
        fence.commitOrWrite(ticket) {
            loaded.forEach { (kind, _) ->
                val updated = entries.computeIfPresent(kind.indexKey(conversationId)) { _, entry ->
                    entry.copy(carriers = transform(kind, entry.carriers))
                }
                updated?.let { guarded { persistence.write(conversationId, kind, it) } }
            }
        }
    }

    private suspend fun <T> guarded(block: suspend () -> T): T? = try {
        block()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (failure: Exception) {
        Timber.w(failure, "Index des médias : disque indisponible")
        null
    }

    override suspend fun clear() = entries.clear()
}
