package me.meeshy.app.feed

import io.mockk.coEvery
import io.mockk.mockk
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.post.UserPostsCacheRepository
import me.meeshy.sdk.post.UserPostsSnapshot

/** Le disque des publications enregistrées, tel que la liste le lit (#19426) : [cached] à l'ouverture, les écritures retenues dans [written]. */
internal fun bookmarksCache(
    cached: CacheResult<UserPostsSnapshot> = CacheResult.Empty,
    written: MutableList<UserPostsSnapshot> = mutableListOf(),
): UserPostsCacheRepository = mockk(relaxed = true) {
    coEvery { ticket() } returns null
    coEvery { cachedBookmarks() } returns cached
    coEvery { persistBookmarks(any(), any()) } coAnswers { written += firstArg<UserPostsSnapshot>() }
}
