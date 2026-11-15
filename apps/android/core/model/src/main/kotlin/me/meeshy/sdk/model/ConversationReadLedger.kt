package me.meeshy.sdk.model

/**
 * Ce que le registre de lecture SAIT d'une conversation (miroir de `ConversationReadEntry` iOS).
 *
 * [serverLastReadAt] est une frontière de lecture SERVEUR (epoch ms) : elle ne se compare qu'à une
 * autre frontière serveur, jamais à l'horloge de l'appareil.
 */
public data class ConversationReadEntry(
    val unreadCount: Int = 0,
    val serverLastReadAt: Long? = null,
    val isMuted: Boolean = false,
) {
    public fun normalized(): ConversationReadEntry = copy(unreadCount = unreadCount.coerceAtLeast(0))
}

/** Ce que le registre restitue : l'entrée, plus le fait dérivé « cette conversation est ouverte ». */
public data class ConversationReadState(
    val conversationId: String,
    val unreadCount: Int,
    val serverLastReadAt: Long?,
    val isMuted: Boolean,
    val isOpen: Boolean,
)

/** Une ligne d'instantané : ce qu'une liste (cache ou serveur) dit d'une conversation en matière de lecture. */
public data class ConversationReadRow(
    val conversationId: String,
    val unreadCount: Int,
    val isMuted: Boolean = false,
)

/** D'où viennent les lignes d'un instantané : « ont-elles été lues au serveur ? ». */
public enum class ConversationReadSource {
    /** Relues du cache local : elles sèment les inconnues, sans écraser un compteur suivi. */
    CACHE,

    /** Lecture serveur fraîche : autoritaire sur le compteur. */
    SERVER,
}

/** L'entrée UNIQUE du registre : tout ce qui change un non-lu sur cet appareil est l'une de ces sept formes. */
public sealed interface ConversationReadEvent {
    /** `conversation:unread-updated` : le compteur servi, par destinataire. */
    public data class ServerUnread(val conversationId: String, val unreadCount: Int) : ConversationReadEvent

    /** `read-status:updated` (type read, par NOUS) : accusé et compteur voyagent ensemble. */
    public data class ServerReceipt(
        val conversationId: String,
        val unreadCount: Int,
        val lastReadAt: Long,
    ) : ConversationReadEvent

    /** L'écran de conversation s'ouvre ([conversationId]) ou se ferme (null). */
    public data class LocalOpen(val conversationId: String?) : ConversationReadEvent

    /** Multi-fenêtre : l'ENSEMBLE des conversations affichées. */
    public data class LocalOpenSet(val conversationIds: Set<String>) : ConversationReadEvent

    /** Geste « marquer comme lu » (jamais la simple ouverture). */
    public data class LocalMarkRead(val conversationId: String) : ConversationReadEvent

    /** Geste « marquer comme non lu ». */
    public data class LocalMarkUnread(val conversationId: String) : ConversationReadEvent

    /** Une liste entière de conversations, et d'où elle vient. */
    public data class Snapshot(
        val rows: List<ConversationReadRow>,
        val source: ConversationReadSource,
    ) : ConversationReadEvent

    /** Cette conversation n'est plus à moi : quittée, supprimée, bannissement. */
    public data class Forget(val conversationId: String) : ConversationReadEvent
}

/**
 * La précédence du non-lu, écrite UNE fois (miroir de `ConversationReadPrecedence` iOS).
 *
 * 1. Conversation OUVERTE : elle se LIT à 0 par projection ([ConversationReadLedgerState.counts]), jamais par écriture.
 * 2. Un accusé serveur est MONOTONE : un `lastReadAt` non strictement postérieur est jeté avec son compteur.
 * 3. Hors conversation ouverte, le compteur SERVI gagne.
 * 4. Un geste LOCAL est optimiste et cède au prochain événement serveur.
 */
public object ConversationReadPrecedence {

    /** Applique un événement NOMMANT UNE conversation à son entrée (rangs 2 à 4). */
    public fun resolve(current: ConversationReadEntry, event: ConversationReadEvent): ConversationReadEntry =
        when (event) {
            is ConversationReadEvent.ServerUnread ->
                current.copy(unreadCount = event.unreadCount.coerceAtLeast(0))

            is ConversationReadEvent.ServerReceipt -> {
                val isNewer = current.serverLastReadAt?.let { event.lastReadAt > it } ?: true
                if (!isNewer) {
                    current
                } else {
                    current.copy(
                        serverLastReadAt = event.lastReadAt,
                        unreadCount = event.unreadCount.coerceAtLeast(0),
                    )
                }
            }

            is ConversationReadEvent.LocalMarkRead -> current.copy(unreadCount = 0)

            is ConversationReadEvent.LocalMarkUnread ->
                current.copy(serverLastReadAt = null, unreadCount = maxOf(1, current.unreadCount))

            is ConversationReadEvent.LocalOpen,
            is ConversationReadEvent.LocalOpenSet,
            is ConversationReadEvent.Snapshot,
            is ConversationReadEvent.Forget,
            -> current
        }
}
