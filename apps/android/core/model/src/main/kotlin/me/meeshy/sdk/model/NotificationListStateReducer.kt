package me.meeshy.sdk.model

/** Ce que la liste de notifications montre : l'ordre chargement, puis erreur, puis vide. */
enum class NotificationListPane { Skeleton, Error, Empty, Content }

/**
 * Cache-first : une ligne en cache s'affiche toujours (jamais de squelette, jamais de page
 * d'erreur) ; sans ligne, le chargement précède l'erreur, qui précède le vide.
 */
object NotificationListStateReducer {
    fun pane(hasRows: Boolean, isLoading: Boolean, loadDidFail: Boolean): NotificationListPane = when {
        hasRows -> NotificationListPane.Content
        isLoading -> NotificationListPane.Skeleton
        loadDidFail -> NotificationListPane.Error
        else -> NotificationListPane.Empty
    }
}
