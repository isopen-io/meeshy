package me.meeshy.sdk.engagement

import java.time.LocalDate
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.conversation.ConversationEngagementRepository
import me.meeshy.sdk.model.ConversationEngagementSnapshot
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.PerAccountCache

/**
 * « 🔥 série · N (M) » du lecteur, par conversation (#8906, iOS `ConversationEngagementStore`).
 *
 * Deux chemins l'alimentent sans ordre garanti : la liste et le détail (`viewerEngagement`, porté par la
 * ligne jusque dans le cache) et le socket (`engagement:conversation-updated`, poussé au seul lecteur
 * crédité). Le magasin garde, par conversation, l'instantané le plus récent
 * ([ConversationEngagementSnapshot.isFresherThan]) : une liste relue du cache après un geste ne fait
 * jamais reculer la pastille. Ce qui s'AFFICHE est ramené au jour du lecteur ([displayed]) : les
 * points du jour retombent à 0 à minuit, la série après un jour sans geste — sans attendre le serveur.
 */
@Singleton
class ConversationEngagementStore internal constructor(
    private val repository: ConversationEngagementRepository,
    private val today: () -> LocalDate,
) : PerAccountCache {

    @Inject
    constructor(repository: ConversationEngagementRepository) : this(repository, LocalDate::now)

    private val _snapshots = MutableStateFlow<Map<String, ConversationEngagementSnapshot>>(emptyMap())

    /** Les instantanés tenus, tels que servis (la relecture au jour civil se fait à l'affichage). */
    val snapshots: StateFlow<Map<String, ConversationEngagementSnapshot>> = _snapshots.asStateFlow()

    fun snapshot(conversationId: String): ConversationEngagementSnapshot? = _snapshots.value[conversationId]

    /**
     * L'état à rendre aujourd'hui, ou `null` quand la pastille se tait (aucun instantané, ou aucun point
     * gagné ici). [seed] est ce que la conversation affichée porte déjà (liste, détail, cache) : il
     * concourt avec l'instantané tenu, le plus récent gagne. Une lecture pure.
     */
    fun displayed(
        conversationId: String,
        seed: ConversationEngagementSnapshot? = null,
        held: Map<String, ConversationEngagementSnapshot> = _snapshots.value,
    ): ConversationEngagementSnapshot? {
        val stored = held[conversationId]
        val offered = seed?.takeIf { it.conversationId == conversationId }
        val pick = when {
            stored != null && offered != null -> if (offered.isFresherThan(stored)) offered else stored
            else -> stored ?: offered
        }
        return pick?.takeIf { it.totalPoints > 0 }?.forDay(ConversationEngagementSnapshot.dayString(today()))
    }

    /** Le flux de ce qui s'affiche pour [conversationId], sans répétition. */
    fun displayedFlow(conversationId: String, seed: ConversationEngagementSnapshot? = null): Flow<ConversationEngagementSnapshot?> =
        _snapshots.map { displayed(conversationId, seed, it) }.distinctUntilChanged()

    fun seed(snapshot: ConversationEngagementSnapshot?) {
        if (snapshot == null) return
        _snapshots.update { held ->
            val current = held[snapshot.conversationId]
            if (current != null && !snapshot.isFresherThan(current)) held else held + (snapshot.conversationId to snapshot)
        }
    }

    /**
     * Relit l'état serveur à l'ouverture d'une conversation : un geste crédité sur un autre appareil n'a
     * pas poussé ici. Silencieux en cas d'échec — la pastille garde ce qu'elle avait.
     */
    suspend fun revalidate(conversationId: String) {
        if (conversationId.isEmpty()) return
        val fetched = try {
            (repository.fetch(conversationId) as? NetworkResult.Success)?.data
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }
        if (fetched != null && fetched.conversationId == conversationId) seed(fetched)
    }

    /** Les points d'un compte ne survivent pas à sa déconnexion : le suivant peut partager des conversations. */
    fun reset() {
        _snapshots.update { if (it.isEmpty()) it else emptyMap() }
    }

    override suspend fun clear() = reset()
}
