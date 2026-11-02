package me.meeshy.sdk.post

import me.meeshy.sdk.model.ApiPost

/**
 * Les derniers posts qu'un détail a lus du serveur, pour que la réouverture d'un détail se peigne sans réseau (#14467),
 * le pendant de la clé par post de `CacheCoordinator.feed` iOS. Borné à [CAPACITY] posts, le plus ancien lu sortant le
 * premier ; vidé avec le compte.
 */
internal class PostDetailMemo {
    private val posts = object : LinkedHashMap<String, ApiPost>(CAPACITY, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, ApiPost>?): Boolean = size > CAPACITY
    }

    @Synchronized
    fun keep(post: ApiPost) {
        posts[post.id] = post
    }

    @Synchronized
    fun get(postId: String): ApiPost? = posts[postId]

    @Synchronized
    fun clear() = posts.clear()

    companion object {
        const val CAPACITY = 64
    }
}
