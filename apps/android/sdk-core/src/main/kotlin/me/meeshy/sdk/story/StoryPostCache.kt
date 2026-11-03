package me.meeshy.sdk.story

import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.session.PerAccountCache
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Cache mémoire des stories PAR ID — port du `postCache` de iOS `StoryService` (BoundedFIFOMap, 500).
 * Il sert un deep-link de notification sans re-lister le fil. Borné (éviction FIFO : la plus ancienne
 * insertion part la première, une mise à jour d'un id déjà tenu ne le rajeunit pas) et purgé à la
 * déconnexion ([PerAccountCache]) : les charges du compte A ne restent pas résidentes pour le compte B.
 * [invalidate] est le miroir de [put] : une story supprimée ou périmée ne ressuscite pas au premier lien.
 */
@Singleton
public class StoryPostCache @Inject constructor() : PerAccountCache {
    private val held = object : LinkedHashMap<String, ApiPost>() {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, ApiPost>?): Boolean = size > CAPACITY
    }

    public fun get(id: String): ApiPost? = synchronized(held) { held[id] }

    public fun put(post: ApiPost) {
        synchronized(held) { held[post.id] = post }
    }

    public fun putAll(posts: Collection<ApiPost>) {
        synchronized(held) { posts.forEach { held[it.id] = it } }
    }

    public fun invalidate(ids: Set<String>) {
        if (ids.isEmpty()) return
        synchronized(held) { ids.forEach { held.remove(it) } }
    }

    public fun size(): Int = synchronized(held) { held.size }

    override suspend fun clear() {
        synchronized(held) { held.clear() }
    }

    public companion object {
        public const val CAPACITY: Int = 500
    }
}
