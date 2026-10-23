package me.meeshy.sdk.story

import me.meeshy.sdk.model.ApiPost
import java.util.concurrent.atomic.AtomicReference
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Cache-first seam of the drained « Mes stories » archive ([KEY]). The archive is immutable
 * server-side, so a drained copy paints the screen instantly while a refresh revalidates.
 * Swapped for the generic CacheEntriesStore (persist-cache-entries-store) once it lands; the
 * screen only depends on this contract.
 */
public interface MyStoriesArchiveCache {
    public suspend fun read(): List<ApiPost>?
    public suspend fun write(posts: List<ApiPost>)
    public suspend fun clear()

    public companion object {
        public const val KEY: String = "my_stories:archive"
    }
}

@Singleton
public class InMemoryMyStoriesArchiveCache @Inject constructor() : MyStoriesArchiveCache {
    private val held = AtomicReference<List<ApiPost>?>(null)

    override suspend fun read(): List<ApiPost>? = held.get()

    override suspend fun write(posts: List<ApiPost>) {
        held.set(posts)
    }

    override suspend fun clear() {
        held.set(null)
    }
}
