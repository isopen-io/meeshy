package me.meeshy.sdk.model

/**
 * Transformations PURES et idempotentes de l'instantané des notifications — miroir de `NotificationCachePatch`
 * (packages/MeeshySDK/.../Notifications/NotificationCachePatch.swift). Elles rendent la MÊME instance quand rien ne
 * change, pour qu'un dépôt sache sans comparer qu'il n'y a rien à écrire.
 */
object NotificationCachePatch {

    fun markingRead(items: List<ApiNotification>, id: String): List<ApiNotification> =
        flipping(items, read = true) { it.id == id }

    fun markingAllRead(items: List<ApiNotification>): List<ApiNotification> =
        flipping(items, read = true) { true }

    /** Le geste inverse, borné à UNE ligne : le retour arrière d'un marquage optimiste refusé par le serveur. */
    fun markingUnread(items: List<ApiNotification>, id: String): List<ApiNotification> =
        flipping(items, read = false) { it.id == id }

    fun removing(items: List<ApiNotification>, id: String): List<ApiNotification> =
        if (items.none { it.id == id }) items else items.filterNot { it.id == id }

    /** Une arrivée en direct : en tête, jamais en double (un id déjà présent est sans effet). */
    fun insertingAtHead(items: List<ApiNotification>, notification: ApiNotification): List<ApiNotification> =
        if (items.any { it.id == notification.id }) items else listOf(notification) + items

    /**
     * Fusionne une page : la version servie d'un id déjà présent remplace la copie locale, les ids nouveaux
     * s'ajoutent, le tout du plus récent au plus ancien (tri stable à date égale).
     */
    fun merging(items: List<ApiNotification>, page: List<ApiNotification>): List<ApiNotification> {
        val served = page.associateBy { it.id }
        val kept = items.map { served[it.id] ?: it }
        val known = items.mapTo(HashSet()) { it.id }
        val added = page.filter { known.add(it.id) }
        return (kept + added).sortedByDescending { isoToEpochMillis(it.state.createdAt) }
    }

    fun unreadCount(items: List<ApiNotification>): Int = items.count { !it.state.isRead }

    private fun flipping(
        items: List<ApiNotification>,
        read: Boolean,
        selects: (ApiNotification) -> Boolean,
    ): List<ApiNotification> {
        if (items.none { selects(it) && it.state.isRead != read }) return items
        return items.map {
            if (selects(it) && it.state.isRead != read) it.copy(state = it.state.copy(isRead = read)) else it
        }
    }
}
