package me.meeshy.sdk.notification

import me.meeshy.sdk.model.ApiNotification

/**
 * Une page de la liste d'UNE portée (catégorie de la cloche) : ses lignes, s'il en reste, et l'ancre de la suite
 * servie par la passerelle. `nextCursor` nul avec `hasMore` vrai = passerelle antérieure : le rang prend le relais.
 */
data class NotificationScopePage(
    val items: List<ApiNotification>,
    val hasMore: Boolean,
    val nextCursor: String?,
)
