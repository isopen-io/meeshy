package me.meeshy.sdk.session

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.category.InMemoryCategorySnapshotStore
import me.meeshy.sdk.chat.InMemoryConversationDraftStore
import me.meeshy.sdk.lock.InMemoryConversationLockStore
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.model.CategoryOption
import me.meeshy.sdk.model.ConversationDraft
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * The logout/account-switch teardown seam (feature-parity §A "Login/logout teardown
 * wiping E2EE keys and per-user caches"): none of Meeshy's on-device stores are
 * namespaced by userId (parity with iOS `CacheCoordinator.reset()`), so a second
 * account signing in on the same device would otherwise inherit the previous
 * account's conversations, messages, categories and drafts. [SessionTeardown.wipe]
 * must leave every one of them empty.
 */
@RunWith(RobolectricTestRunner::class)
class SessionTeardownTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var outboxRepository: OutboxRepository

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
        outboxRepository = OutboxRepository(db, db.outboxDao())
    }

    @After
    fun tearDown() {
        db.close()
    }

    private fun teardown(
        categoryStore: InMemoryCategorySnapshotStore = InMemoryCategorySnapshotStore(),
        draftStore: InMemoryConversationDraftStore = InMemoryConversationDraftStore(),
        lockStore: InMemoryConversationLockStore = InMemoryConversationLockStore(),
        storyDraftStore: InMemoryStoryComposerDraftStore = InMemoryStoryComposerDraftStore(),
    ) = DefaultSessionTeardown(db, categoryStore, draftStore, lockStore, storyDraftStore)

    private fun composerDraft() = StoryComposerDraftSnapshot(
        slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "half-written story", mediaIds = listOf("cmid_1"))),
        selectedId = "s1",
        updatedAt = "2026-08-27T12:00:00Z",
    )

    @Test
    fun wipe_clearsEveryRoomTable() = runTest {
        outboxRepository.enqueue(
            OutboxMutation(OutboxKind.SEND_MESSAGE, OutboxLanes.forMessage("c1"), "cid_1", "{}", cmid = "m1"),
        )
        assertThat(outboxRepository.observeAll().first()).isNotEmpty()

        teardown().wipe()

        assertThat(outboxRepository.observeAll().first()).isEmpty()
    }

    @Test
    fun wipe_resetsTheCategorySnapshotToAColdCache() = runTest {
        val categoryStore = InMemoryCategorySnapshotStore(
            initial = listOf(CategoryOption(id = "work", name = "Work")),
            initialSyncedAt = 42L,
        )

        teardown(categoryStore = categoryStore).wipe()

        assertThat(categoryStore.observe().first()).isNull()
        assertThat(categoryStore.lastSyncedAt().first()).isNull()
    }

    @Test
    fun wipe_removesEveryConversationDraft() = runTest {
        val draftStore = InMemoryConversationDraftStore(
            initial = mapOf(
                "c1" to ConversationDraft(conversationId = "c1", text = "unsent", updatedAt = "2026-08-08T12:00:00Z"),
            ),
        )

        teardown(draftStore = draftStore).wipe()

        assertThat(draftStore.observeAll().first()).isEmpty()
    }

    @Test
    fun wipe_resetsConversationLockState() = runTest {
        val lockStore = InMemoryConversationLockStore()
        lockStore.setMasterPin("123456")
        lockStore.setLock("c1", "1111")

        teardown(lockStore = lockStore).wipe()

        assertThat(lockStore.hasMasterPin()).isFalse()
        assertThat(lockStore.lockedConversationIds).isEmpty()
    }

    @Test
    fun wipe_removesTheStoryComposerDraft() = runTest {
        val storyDraftStore = InMemoryStoryComposerDraftStore(initial = composerDraft())
        assertThat(storyDraftStore.load()).isNotNull()

        teardown(storyDraftStore = storyDraftStore).wipe()

        assertThat(storyDraftStore.load()).isNull()
    }

    @Test
    fun wipe_isIdempotentOnAnAlreadyClearDevice() = runTest {
        val categoryStore = InMemoryCategorySnapshotStore()
        val draftStore = InMemoryConversationDraftStore()
        val lockStore = InMemoryConversationLockStore()
        val storyDraftStore = InMemoryStoryComposerDraftStore()
        val instance = teardown(
            categoryStore = categoryStore,
            draftStore = draftStore,
            lockStore = lockStore,
            storyDraftStore = storyDraftStore,
        )

        instance.wipe()
        instance.wipe()

        assertThat(outboxRepository.observeAll().first()).isEmpty()
        assertThat(categoryStore.observe().first()).isNull()
        assertThat(draftStore.observeAll().first()).isEmpty()
        assertThat(lockStore.hasMasterPin()).isFalse()
        assertThat(lockStore.lockedConversationIds).isEmpty()
        assertThat(storyDraftStore.load()).isNull()
    }
}
