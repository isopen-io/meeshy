package me.meeshy.sdk.conversation

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.OpenConversationLedger
import me.meeshy.sdk.socket.ConversationRoomRegistry
import javax.inject.Inject
import javax.inject.Singleton

/**
 * LA source unique de « quelles conversations sont à l'écran » (miroir de l'`OpenConversationLedger` du moteur de
 * synchronisation, iOS) : le non-lu, la présence « ici » et l'émission `viewing` la lisent, aucune ne tient la sienne.
 *
 * Plusieurs fenêtres (tablette, pliable) peuvent afficher la même conversation : la salle se rejoint à la PREMIÈRE
 * ouverture et ne se quitte qu'à la DERNIÈRE fermeture.
 */
@Singleton
class OpenConversationRegistry @Inject constructor(
    private val rooms: ConversationRoomRegistry,
) : OpenConversationLookup {
    private val lock = Any()
    private val _ledger = MutableStateFlow(OpenConversationLedger())

    val ledger: StateFlow<OpenConversationLedger> = _ledger.asStateFlow()

    val activeConversationId: String? get() = _ledger.value.activeConversationId

    val openConversationIds: Set<String> get() = _ledger.value.openConversationIds

    override fun isOpen(conversationId: String): Boolean = conversationId in openConversationIds

    /** Rend vrai à la première ouverture de cette conversation. */
    fun open(conversationId: String): Boolean {
        val transition = synchronized(lock) {
            _ledger.value.opening(conversationId).also {
                _ledger.value = it.ledger
                rooms.notePriority(it.ledger.activeConversationId, it.ledger.openConversationIds)
            }
        }
        if (transition.changed) rooms.join(conversationId)
        return transition.changed
    }

    /** Rend vrai quand c'était la dernière fenêtre : la salle est alors quittée. */
    fun close(conversationId: String): Boolean {
        val transition = synchronized(lock) {
            _ledger.value.closing(conversationId).also {
                _ledger.value = it.ledger
                rooms.notePriority(it.ledger.activeConversationId, it.ledger.openConversationIds)
            }
        }
        if (transition.changed) rooms.leave(conversationId)
        return transition.changed
    }
}
