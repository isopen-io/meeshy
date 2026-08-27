package me.meeshy.sdk.session

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.category.CategorySnapshotStore
import me.meeshy.sdk.chat.ConversationDraftStore
import me.meeshy.sdk.lock.ConversationLockStore
import me.meeshy.sdk.story.StoryComposerDraftStore

/**
 * Wipes every disk-persisted, per-account cache on logout/account-switch — parity
 * with iOS `RootView`'s logout branch (`CacheCoordinator.reset()` + friendship-cache
 * clear, `apps/ios/Meeshy/App/MeeshyApp.swift`, part-13 audit). None of Meeshy's
 * on-device stores are namespaced by userId, so a second account signing in on the
 * same device would otherwise inherit the previous account's cached conversations,
 * messages, stories, categories, unsent chat drafts, an in-progress story composer
 * draft, and — same reasoning as iOS's own `ConversationLockManager.resetForLogout` —
 * conversation-lock PINs.
 *
 * [wipe] is called by [me.meeshy.sdk.auth.AuthRepository.logout] before the caller
 * treats the session as ended, so a subsequent login never races a still-running
 * wipe. E2EE key material has no analogue here yet — Android carries no client-side
 * Signal/identity-key store to wipe (unlike iOS's Keychain-backed one); this seam is
 * where that clear would land once one exists.
 */
public interface SessionTeardown {
    /** Clears every per-account store. Idempotent — safe to call on an already-clear device. */
    public suspend fun wipe()
}

public class DefaultSessionTeardown(
    private val database: MeeshyDatabase,
    private val categorySnapshotStore: CategorySnapshotStore,
    private val conversationDraftStore: ConversationDraftStore,
    private val conversationLockStore: ConversationLockStore,
    private val storyComposerDraftStore: StoryComposerDraftStore,
) : SessionTeardown {

    override suspend fun wipe() {
        // Room's clearAllTables() is a blocking call — never on the caller's dispatcher.
        withContext(Dispatchers.IO) { database.clearAllTables() }
        categorySnapshotStore.clearAll()
        conversationDraftStore.clearAll()
        conversationLockStore.resetForLogout()
        storyComposerDraftStore.clear()
    }
}
