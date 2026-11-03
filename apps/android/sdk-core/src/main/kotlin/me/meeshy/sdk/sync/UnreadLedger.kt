package me.meeshy.sdk.sync

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.ConversationReadEntry
import me.meeshy.sdk.model.ConversationReadEvent
import me.meeshy.sdk.model.ConversationReadLedgerState
import me.meeshy.sdk.model.sync.OpenConversations
import me.meeshy.sdk.model.sync.UnreadRules
import me.meeshy.sdk.session.PerAccountCache

/**
 * Le registre de lecture VIVANT de l'appareil (miroir de `ConversationReadLedger` iOS) : l'état pur
 * ([ConversationReadLedgerState]) plus les fenêtres ouvertes ([OpenConversations]), sérialisés par un verrou
 * et publiés en un [snapshot] que lisent toutes les surfaces — jamais un compteur non nul sur la conversation ouverte.
 */
@Singleton
public class UnreadLedger @Inject constructor() : PerAccountCache {

    /** Les décomptes AFFICHÉS (l'ouverte à zéro) et les conversations ouvertes. */
    public data class Snapshot(val counts: Map<String, Int> = emptyMap(), val openIds: Set<String> = emptySet()) {
        /** Le total des AUTRES conversations : badge de retour, onglet, widget, notification. */
        public val totalOthers: Int get() = UnreadRules.totalConversationsUnread(counts, openIds)
    }

    private val lock = Any()
    private var state = ConversationReadLedgerState()
    private var windows = OpenConversations()
    private val _snapshot = MutableStateFlow(Snapshot())
    public val snapshot: StateFlow<Snapshot> = _snapshot.asStateFlow()

    /** Applique un événement ; rend l'entrée d'AVANT pour la conversation nommée (rollback = un événement de plus). */
    public fun apply(event: ConversationReadEvent): ConversationReadEntry? = synchronized(lock) {
        val applied = state.apply(event)
        state = applied.state
        publish()
        applied.previous
    }

    /** Une fenêtre s'ouvre sur [conversationId] : elle se lit à zéro, sans rien écrire dans son décompte. */
    public fun open(conversationId: String) {
        synchronized(lock) {
            windows = windows.open(conversationId)
            state = state.apply(ConversationReadEvent.LocalOpenSet(windows.ids)).state
            publish()
        }
    }

    /**
     * Une fenêtre se ferme. À la DERNIÈRE fermeture d'une conversation, le reste réel noté par
     * [noteUnreadRemaining] lui est rendu ; sinon son compte servi demeure. Rend ce reste, s'il y en a un.
     */
    public fun close(conversationId: String): Int? = synchronized(lock) {
        val closing = windows.close(conversationId)
        windows = closing.next
        state = state.apply(ConversationReadEvent.LocalOpenSet(windows.ids)).state
        val restore = closing.restore
        if (closing.closed && restore != null) {
            state = state.apply(ConversationReadEvent.ServerUnread(conversationId, restore)).state
        }
        publish()
        restore
    }

    /** Après une lecture partielle : ce qui reste réellement à lire. */
    public fun noteUnreadRemaining(conversationId: String, remaining: Int) {
        synchronized(lock) { windows = windows.noteUnreadRemaining(conversationId, remaining) }
    }

    /** Le compteur SU d'une conversation (jamais projeté) : ce que le cache doit garder. */
    public fun heldCount(conversationId: String): Int? = synchronized(lock) { state.state(conversationId)?.unreadCount }

    override suspend fun clear() {
        synchronized(lock) {
            state = ConversationReadLedgerState()
            windows = OpenConversations()
            publish()
        }
    }

    private fun publish() {
        _snapshot.value = Snapshot(state.counts(), state.openConversationIds)
    }
}
