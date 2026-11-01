package me.meeshy.app.feed

/**
 * Ce que le corps du fil montre — UN état à la fois (#14263). Hors ligne sans rien de gardé, le fil dit une seule chose :
 * il est hors ligne et n'a pas encore été chargé ; jamais un bandeau « restent affichées » au-dessus d'une erreur vide.
 */
enum class FeedBody { SKELETON, POSTS, EMPTY, LOAD_ERROR, OFFLINE_EMPTY }

val FeedUiState.body: FeedBody
    get() = when {
        showSkeleton -> FeedBody.SKELETON
        posts.isNotEmpty() -> FeedBody.POSTS
        loadFailed && isOffline -> FeedBody.OFFLINE_EMPTY
        loadFailed -> FeedBody.LOAD_ERROR
        else -> FeedBody.EMPTY
    }

/** Le bandeau « Hors ligne — les publications déjà vues restent affichées » ne se pose que sur des publications lisibles. */
val FeedUiState.showsOfflineBand: Boolean
    get() = isOffline && body == FeedBody.POSTS
