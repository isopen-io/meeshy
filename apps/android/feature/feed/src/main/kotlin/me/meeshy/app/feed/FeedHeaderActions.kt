package me.meeshy.app.feed

/** A trailing action rendered in the Feed's [CollapsibleHeader]. */
enum class FeedHeaderAction { REELS, NEARBY }

/**
 * Composition pure du bandeau d'actions de l'en-tête Feed — source de vérité unique
 * de « quelle action, dans quel ordre », verrouillée par [FeedHeaderActionsTest] comme
 * [PostActionMenu.actions] verrouille le menu d'options d'un post.
 */
internal fun feedHeaderActions(): List<FeedHeaderAction> = listOf(
    FeedHeaderAction.REELS,
    FeedHeaderAction.NEARBY,
)
