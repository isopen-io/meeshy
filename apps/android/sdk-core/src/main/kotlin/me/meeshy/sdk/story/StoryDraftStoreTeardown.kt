package me.meeshy.sdk.story

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.session.PerAccountCache

/** La frontière de compte (iOS `AuthManager+Accounts` : `StoryDraftStore.shared.clear()`) : les brouillons partent avec le compte. */
public class StoryDraftStoreTeardown(private val store: StoryDraftStoring) : PerAccountCache {
    override suspend fun clear() {
        val cleared = withContext(Dispatchers.IO) { store.clear() }
        check(cleared) { "story drafts were not fully erased" }
    }
}
