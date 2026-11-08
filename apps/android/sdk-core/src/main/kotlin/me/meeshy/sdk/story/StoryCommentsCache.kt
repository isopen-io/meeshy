package me.meeshy.sdk.story

import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.session.PerAccountCache
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

/** La première page de racines d'une story telle que servie : de quoi peindre l'overlay avant tout réseau. */
data class StoryCommentsSnapshot(
    val roots: List<ApiPostComment>,
    val nextCursor: String?,
    val hasMore: Boolean,
)

/**
 * Cache-first des commentaires d'une story : la liste locale est servie d'abord, le réseau revalide ensuite. Lié au
 * compte connecté ([PerAccountCache]) : un second compte n'ouvre jamais sur les commentaires du premier. Les lignes
 * gardent leur forme serveur — le Prisme les re-résout à chaque lecture, un changement de langue ne les périme pas.
 */
interface StoryCommentsCache : PerAccountCache {
    suspend fun read(storyId: String): StoryCommentsSnapshot?
    suspend fun write(storyId: String, snapshot: StoryCommentsSnapshot)
}

@Singleton
class InMemoryStoryCommentsCache @Inject constructor() : StoryCommentsCache {
    private val held = ConcurrentHashMap<String, StoryCommentsSnapshot>()

    override suspend fun read(storyId: String): StoryCommentsSnapshot? = held[storyId]

    override suspend fun write(storyId: String, snapshot: StoryCommentsSnapshot) {
        if (held.size >= MAX_STORIES && !held.containsKey(storyId)) held.keys.firstOrNull()?.let { held.remove(it) }
        held[storyId] = snapshot
    }

    override suspend fun clear() {
        held.clear()
    }

    private companion object {
        const val MAX_STORIES = 40
    }
}
