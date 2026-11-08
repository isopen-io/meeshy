package me.meeshy.sdk.notification

/**
 * Une sélection de la liste (types gardés, non lues seulement, types dont on retire les lignes lues) — la même clé que
 * celle que la passerelle applique en base. Seule la portée [All] est persistée ; les autres vivent en mémoire pour la
 * session et se vident à la déconnexion.
 */
data class NotificationScope(
    val types: Set<String> = emptySet(),
    val unreadOnly: Boolean = false,
    val hideReadTypes: Set<String> = emptySet(),
) {
    val isAll: Boolean get() = types.isEmpty() && !unreadOnly && hideReadTypes.isEmpty()

    /** Stable : indépendante de l'ordre des types. */
    val key: String
        get() = if (isAll) ALL_KEY else "types=${types.sorted().joinToString(",")};unread=$unreadOnly;hide=${hideReadTypes.sorted().joinToString(",")}"

    companion object {
        const val ALL_KEY: String = "all"
        val All: NotificationScope = NotificationScope()
    }
}
