package me.meeshy.sdk.model.chatlist

/** Une ligne de la fenêtre : son identité locale (clé de liste) et celle du serveur, une fois accusée. */
data class MessageRowIds(val localId: String, val serverId: String?)

/**
 * `serverId` → `localId` (iOS `serverIdToLocalId`, `MessageListSnapshotPrep`). Les événements
 * de traduction et de transcription portent l'id SERVEUR ; la liste est clavée par l'identité
 * locale. Un message optimiste accusé par la passerelle reste donc UNE bulle.
 */
class LocalIdServerIdTable private constructor(private val byServerId: Map<String, String>) {

    /** La clé de liste d'un id d'événement ; un id inconnu est déjà une clé locale (ligne non accusée). */
    fun localIdFor(key: String): String = byServerId[key] ?: key

    fun localIdsFor(keys: Set<String>): Set<String> = keys.mapTo(LinkedHashSet()) { localIdFor(it) }

    companion object {
        val EMPTY = LocalIdServerIdTable(emptyMap())

        fun of(rows: List<MessageRowIds>): LocalIdServerIdTable =
            LocalIdServerIdTable(
                rows.filter { !it.serverId.isNullOrEmpty() }.associate { it.serverId!! to it.localId },
            )

        /**
         * Retire le jumeau serveur d'une ligne optimiste accusée : si une ligne `A` porte
         * `serverId = X` et qu'une autre ligne a `localId = X`, la seconde duplique `A`.
         * `A` reste, à sa place.
         */
        fun <T> collapseTwins(rows: List<T>, ids: (T) -> MessageRowIds): List<T> {
            val acked = rows.map(ids).filter { !it.serverId.isNullOrEmpty() && it.serverId != it.localId }
            val shadowed = acked.mapTo(HashSet()) { it.serverId }
            if (shadowed.isEmpty()) return rows
            return rows.filter { row ->
                val id = ids(row)
                id.localId !in shadowed || !id.serverId.isNullOrEmpty() && id.serverId != id.localId
            }
        }
    }
}

/**
 * Compensation d'une suppression SOUS la fenêtre affichée (iOS `noteDeletionCompensation`).
 * Les rangs vont du plus récent (0) au plus ancien : retirer une rangée dont le rang est
 * inférieur à la première visible décale tout ce qui est affiché ; la position de lecture se
 * corrige du nombre de rangées retirées en dessous.
 */
object DeletionCompensation {

    fun firstVisibleIndexAfter(previousKeys: List<String>, nextKeys: List<String>, firstVisibleIndex: Int): Int {
        if (firstVisibleIndex <= 0) return firstVisibleIndex
        val kept = nextKeys.toHashSet()
        val removedBelow = previousKeys.take(firstVisibleIndex).count { it !in kept }
        return (firstVisibleIndex - removedBelow).coerceAtLeast(0)
    }
}
