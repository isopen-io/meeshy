package me.meeshy.app.feed

import io.mockk.coEvery
import io.mockk.mockk
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.post.UserPostsCacheRepository
import me.meeshy.sdk.post.UserPostsSnapshot
import me.meeshy.sdk.session.AccountTicket

/**
 * Le disque des publications enregistrées, tel que la liste le lit (#19426) : [cached] à l'ouverture, les écritures
 * retenues dans [written] avec le compte sous lequel chacune est partie dans [tickets] ; [account] dit le compte connecté
 * à l'instant où le ticket est pris.
 */
internal fun bookmarksCache(
    cached: CacheResult<UserPostsSnapshot> = CacheResult.Empty,
    written: MutableList<UserPostsSnapshot> = mutableListOf(),
    tickets: MutableList<AccountTicket?> = mutableListOf(),
    account: () -> AccountTicket? = { null },
): UserPostsCacheRepository = mockk(relaxed = true) {
    coEvery { ticket() } coAnswers { account() }
    coEvery { cachedBookmarks() } returns cached
    coEvery { persistBookmarks(any(), any()) } coAnswers {
        written += firstArg<UserPostsSnapshot>()
        tickets += secondArg<AccountTicket?>()
    }
}
