package me.meeshy.sdk.model

/**
 * Lois de fusion du fil (miroir d'iOS `FeedViewModel+Pagination` : `mergePreservingRealtimeHead`,
 * `mergePreservingLoadedPages`, `reapplyPendingLikes`). Pures : la relecture silencieuse de la tete
 * du fil ne tronque jamais ce que l'utilisateur a deja fait defiler, et n'efface jamais un post
 * arrive par la socket pendant le vol.
 */
object FeedMergeLaws {

    /**
     * La page relue, precedee des posts temps reel STRICTEMENT plus recents que le plus recent des
     * posts relus et absents de la page. Une suppression serveur a l'interieur de la plage relue
     * s'applique toujours. Une page relue vide ne protege rien : elle est rendue telle quelle.
     */
    fun mergePreservingRealtimeHead(fetched: List<ApiPost>, existing: List<ApiPost>): List<ApiPost> {
        val newestFetched = fetched.firstOrNull() ?: return fetched
        val newest = timestampOf(newestFetched)
        val fetchedIds = fetched.mapTo(HashSet()) { it.id }
        val realtimeHead = existing.filter { timestampOf(it) > newest && it.id !in fetchedIds }
        return if (realtimeHead.isEmpty()) fetched else realtimeHead + fetched
    }

    /**
     * La tete relue (temps reel protege), plus les pages deja chargees PLUS ANCIENNES que la page
     * relue : la relecture silencieuse ne tronque plus la liste. Les posts supprimes dans la plage
     * relue disparaissent toujours.
     */
    fun mergePreservingLoadedPages(fetched: List<ApiPost>, existing: List<ApiPost>): List<ApiPost> {
        val head = mergePreservingRealtimeHead(fetched, existing)
        val oldestFetched = fetched.lastOrNull() ?: return head
        val oldest = timestampOf(oldestFetched)
        val headIds = head.mapTo(HashSet()) { it.id }
        val loadedTail = existing.filter { timestampOf(it) < oldest && it.id !in headIds }
        return if (loadedTail.isEmpty()) head else head + loadedTail
    }

    /**
     * Rejoue les likes encore en attente d'outbox par-dessus un instantane serveur perime : le coeur
     * ne se vide pas sous les yeux de l'utilisateur, le compteur suit et n'est jamais negatif.
     * [pendingLikes] : postId -> etat « aime » vise par la mutation non livree.
     */
    fun reapplyPendingLikes(posts: List<ApiPost>, pendingLikes: Map<String, Boolean>): List<ApiPost> {
        if (pendingLikes.isEmpty()) return posts
        return posts.map { post ->
            val liked = pendingLikes[post.id] ?: return@map post
            if ((post.isLikedByMe == true) == liked) return@map post
            post.copy(
                isLikedByMe = liked,
                likeCount = ((post.likeCount ?: 0) + if (liked) 1 else -1).coerceAtLeast(0),
            )
        }
    }

    /** Ajoute a [current] la page [page] sans doublon (une page ne reecrit jamais une ligne deja la). */
    fun appendingPage(current: List<ApiPost>, page: List<ApiPost>): List<ApiPost> {
        val known = current.mapTo(HashSet()) { it.id }
        return current + page.filter { it.id !in known }
    }

    private fun timestampOf(post: ApiPost): Long = isoToEpochMillis(post.createdAt)
}

/**
 * Compteur de generation du fil : chaque relecture complete (tirer pour rafraichir) ouvre une
 * nouvelle generation, et une page demandee sous l'ancienne est ignoree a son retour — elle suivait
 * une liste qui n'existe plus. La relecture silencieuse qui garde les pages chargees ne l'avance pas.
 */
class FeedGeneration {
    @Volatile
    private var value: Int = 0

    /** Jeton de la generation courante, a prendre AVANT de partir chercher une page. */
    fun current(): Int = value

    fun advance() {
        value += 1
    }

    fun isCurrent(token: Int): Boolean = token == value
}
