package me.meeshy.app.notifications

import me.meeshy.sdk.model.NotificationFilterCategory
import me.meeshy.sdk.notification.NotificationScope

/**
 * La portée de cache d'une catégorie : exactement la requête de la loi pure ([NotificationFilterCategory.serverQuery]),
 * donc une clé stable par catégorie. [NotificationFilterCategory.ALL] est la liste partagée et persistée.
 */
internal fun NotificationFilterCategory.scope(): NotificationScope {
    if (this == NotificationFilterCategory.ALL) return NotificationScope.All
    val query = serverQuery
    return NotificationScope(
        types = query.types.toSet(),
        unreadOnly = query.unreadOnly,
        hideReadTypes = query.hideReadTypes.toSet(),
    )
}
