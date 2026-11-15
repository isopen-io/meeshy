package me.meeshy.sdk.session

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.category.InMemoryCategorySnapshotStore
import me.meeshy.sdk.chat.InMemoryConversationDraftStore
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.lock.InMemoryConversationLockStore
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationState
import me.meeshy.sdk.notification.NotificationRepository
import me.meeshy.sdk.net.api.NotificationApi
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
 * account's conversations, messages, categories, drafts, friendship graph and
 * notifications. [SessionTeardown.wipe] must leave every one of them empty.
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
        friendshipCache: FriendshipCache = FriendshipCache(),
        notificationRepository: NotificationRepository = NotificationRepository(mockk(relaxed = true)),
        blockCache: BlockCache = BlockCache(),
        preferenceSnapshots: me.meeshy.sdk.preferences.PreferenceSnapshotStore =
            me.meeshy.sdk.preferences.InMemoryPreferenceSnapshotStore(),
        perAccountCaches: Set<PerAccountCache> = emptySet(),
        guestSessions: AnonymousSessionStore? = null,
        feedbackToasts: me.meeshy.sdk.feedback.FeedbackToastCenter? = null,
        lostSends: LostSendsNotifier? = null,
        fence: AccountFence? = null,
    ) = DefaultSessionTeardown(
        db,
        categoryStore,
        draftStore,
        lockStore,
        storyDraftStore,
        friendshipCache,
        notificationRepository,
        blockCache,
        preferenceSnapshots,
        perAccountCaches,
        guestSessions,
        fence = fence,
        feedbackToasts = feedbackToasts,
        lostSends = lostSends,
    )

    private fun pendingSend() = OutboxMutation(OutboxKind.SEND_MESSAGE, OutboxLanes.forMessage("c1"), "cid_1", "{}", cmid = "m1")

    private fun notifier(toasts: me.meeshy.sdk.feedback.FeedbackToastCenter) =
        LostSendsNotifier(toasts) { count -> "perdus:$count" }

    private class RecordingCache(private val failure: Exception? = null) : PerAccountCache {
        var clears = 0
        override suspend fun clear() {
            clears++
            failure?.let { throw it }
        }
    }

    private fun composerDraft() = StoryComposerDraftSnapshot(
        slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "half-written story", mediaIds = listOf("cmid_1"))),
        selectedId = "s1",
        updatedAt = "2026-08-27T12:00:00Z",
    )

    @Test
    fun wipe_dropsTheGuestSessionSoNoLaterAccountInheritsItsPermissionsOrToken() = runTest {
        val guest = InMemoryAnonymousSessionStore(
            me.meeshy.sdk.model.AnonymousSessionContext(
                sessionToken = "guest-token",
                participantId = "p1",
                permissions = me.meeshy.sdk.model.ParticipantPermissions.anonymous(false, false, false),
                linkId = "l1",
                conversationId = "c1",
            ),
        )

        teardown(guestSessions = guest).wipe()

        assertThat(guest.load()).isNull()
    }

    @Test
    fun wipe_purgesThePendingToastAndItsTapHandler() = runTest {
        val toasts = me.meeshy.sdk.feedback.FeedbackToastCenter()
        var taps = 0
        toasts.show("de A", onTap = { taps++ })
        val id = toasts.current.value!!.id

        teardown(feedbackToasts = toasts).wipe()
        toasts.tap(id)

        assertThat(toasts.current.value).isNull()
        assertThat(taps).isEqualTo(0)
    }

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
    fun wipe_clearsTheStoryPostCache() = runTest {
        val cache = me.meeshy.sdk.story.StoryPostCache()
        cache.put(me.meeshy.sdk.model.ApiPost(id = "s1", type = "STORY"))

        teardown(perAccountCaches = setOf(cache)).wipe()

        assertThat(cache.get("s1")).isNull()
    }

    @Test
    fun wipe_erasesPendingSharesAndTheirCopies() = runTest {
        val root = java.nio.file.Files.createTempDirectory("share-teardown").toFile().resolve("root")
        val store = me.meeshy.sdk.share.SharePendingShareStore(root)
        store.commit(
            me.meeshy.sdk.model.share.SharePendingShare.make("s1", 1L, "u1", "hi", emptyList(), listOf("c1")),
        )
        store.mediaDirectory("s1").apply { mkdirs() }.resolve("a.jpg").writeText("x")

        teardown(perAccountCaches = setOf(store)).wipe()

        assertThat(store.pending("u1")).isEmpty()
        assertThat(root.exists()).isFalse()
    }

    @Test
    fun wipe_emptiesTheMultiDraftStoryStore() = runTest {
        val root = java.nio.file.Files.createTempDirectory("story-drafts-teardown").toFile()
        val store = me.meeshy.sdk.story.StoryDraftDiskStore(root.resolve("files"), root.resolve("sessions"), kotlinx.serialization.json.Json)
        val draft = StoryComposerDraftSnapshot(slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "le brouillon de A")), selectedId = "s1")
        store.save("a", draft, mapOf("m.jpg" to root.resolve("m.jpg").apply { writeText("A") }))

        teardown(perAccountCaches = setOf(me.meeshy.sdk.story.StoryDraftStoreTeardown(store))).wipe()

        assertThat(store.isEmpty()).isTrue()
        assertThat(store.load("a")).isNull()
        assertThat(root.resolve("files/StoryDrafts").exists()).isFalse()
    }

    @Test
    fun wipe_clearsTheActiveSessionsSnapshot() = runTest {
        val sessions = InMemoryUserSessionsSnapshotStore()
        sessions.save(me.meeshy.sdk.model.session.UserSessionsPayload(listOf(me.meeshy.sdk.model.session.UserSession("a"))), 5L)

        teardown(perAccountCaches = setOf(sessions)).wipe()

        assertThat(sessions.observe().first()).isNull()
        assertThat(sessions.lastSyncedAt().first()).isNull()
    }

    @Test
    fun wipe_clearsTheAccountPreferenceSnapshots() = runTest {
        val snapshots = me.meeshy.sdk.preferences.InMemoryPreferenceSnapshotStore()
        snapshots.save("all", "{}", 5L)

        teardown(preferenceSnapshots = snapshots).wipe()

        assertThat(snapshots.observe("all").first()).isNull()
        assertThat(snapshots.lastSyncedAt("all").first()).isNull()
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
    fun wipe_clearsTheFriendshipCacheAndTheNotificationRepositorySingletons() = runTest {
        val friendshipCache = FriendshipCache()
        friendshipCache.didReceiveRequest(senderId = "alice", requestId = "r1")
        assertThat(friendshipCache.pendingReceivedCount).isEqualTo(1)

        val notificationApi: NotificationApi = mockk(relaxed = true)
        val notificationRepository = NotificationRepository(notificationApi)
        notificationRepository.prependLive(
            ApiNotification(id = "n1", state = NotificationState(isRead = false, createdAt = "2026-08-27T12:00:00Z")),
        )
        assertThat(notificationRepository.unreadCountStream.value).isEqualTo(1)

        teardown(friendshipCache = friendshipCache, notificationRepository = notificationRepository).wipe()

        assertThat(friendshipCache.pendingReceivedCount).isEqualTo(0)
        assertThat(notificationRepository.unreadCountStream.value).isEqualTo(0)
    }

    @Test
    fun wipe_clearsTheBlockCache() = runTest {
        val blockCache = BlockCache()
        blockCache.setBlocked("bob", blocked = true)
        assertThat(blockCache.isBlocked("bob")).isTrue()

        teardown(blockCache = blockCache).wipe()

        assertThat(blockCache.isBlocked("bob")).isFalse()
        assertThat(blockCache.blockedCount).isEqualTo(0)
    }

    @Test
    fun wipe_isIdempotentOnAnAlreadyClearDevice() = runTest {
        val categoryStore = InMemoryCategorySnapshotStore()
        val draftStore = InMemoryConversationDraftStore()
        val lockStore = InMemoryConversationLockStore()
        val storyDraftStore = InMemoryStoryComposerDraftStore()
        val friendshipCache = FriendshipCache()
        val notificationRepository = NotificationRepository(mockk(relaxed = true))
        val blockCache = BlockCache()
        val instance = teardown(
            categoryStore = categoryStore,
            draftStore = draftStore,
            lockStore = lockStore,
            storyDraftStore = storyDraftStore,
            friendshipCache = friendshipCache,
            notificationRepository = notificationRepository,
            blockCache = blockCache,
        )

        instance.wipe()
        instance.wipe()

        assertThat(outboxRepository.observeAll().first()).isEmpty()
        assertThat(categoryStore.observe().first()).isNull()
        assertThat(draftStore.observeAll().first()).isEmpty()
        assertThat(lockStore.hasMasterPin()).isFalse()
        assertThat(lockStore.lockedConversationIds).isEmpty()
        assertThat(storyDraftStore.load()).isNull()
        assertThat(friendshipCache.pendingReceivedCount).isEqualTo(0)
        assertThat(notificationRepository.unreadCountStream.value).isEqualTo(0)
        assertThat(blockCache.blockedCount).isEqualTo(0)
    }

    @Test
    fun wipe_clearsEveryBoundPerAccountCache() = runTest {
        val first = RecordingCache()
        val second = RecordingCache()

        teardown(perAccountCaches = setOf(first, second)).wipe()

        assertThat(first.clears).isEqualTo(1)
        assertThat(second.clears).isEqualTo(1)
    }

    @Test
    fun wipe_leavesNoLinkOfTheFirstAccountForTheNext() = runTest {
        val shareLinks = me.meeshy.sdk.sharelink.ShareLinksCache()
        val hubLinks = me.meeshy.sdk.link.LinksCache()
        shareLinks.put(listOf(me.meeshy.sdk.model.MyShareLink(id = "1", linkId = "mshy_first")))
        hubLinks.putTrackingLinks(listOf(me.meeshy.sdk.model.TrackingLink(id = "2", token = "first")))
        hubLinks.putAffiliateTokens(listOf(me.meeshy.sdk.model.AffiliateToken(id = "3", token = "t", name = "n")))
        hubLinks.putCommunityLinks(listOf(me.meeshy.sdk.model.CommunityLink(id = "4")))

        teardown(perAccountCaches = setOf(shareLinks, hubLinks)).wipe()

        assertThat(shareLinks.read()).isNull()
        assertThat(shareLinks.find("mshy_first")).isNull()
        assertThat(hubLinks.trackingLinks()).isNull()
        assertThat(hubLinks.affiliateTokens()).isNull()
        assertThat(hubLinks.communityLinks()).isNull()
        assertThat(hubLinks.figures()).isNull()
    }

    @Test
    fun wipe_isIdempotentForPerAccountCaches() = runTest {
        val cache = RecordingCache()
        val teardown = teardown(perAccountCaches = setOf(cache))

        teardown.wipe()
        teardown.wipe()

        assertThat(cache.clears).isEqualTo(2)
    }

    @Test
    fun wipe_aFailingPerAccountCacheDoesNotStopTheOthers() = runTest {
        val after = RecordingCache()

        teardown(perAccountCaches = setOf(RecordingCache(IllegalStateException("boom")), after)).wipe()

        assertThat(after.clears).isEqualTo(1)
    }

    @Test
    fun wipe_emptiesTheGenericCacheTables() = runTest {
        db.keyedJsonCacheDao().upsert(
            me.meeshy.core.database.entity.KeyedJsonCacheEntity("community:list", "k", "{}", 1L),
        )
        db.cacheEntryDao().upsert(
            listOf(me.meeshy.core.database.entity.CacheEntryEntity("ns", "k", "a", 0, "h", 1L, "{}")),
        )

        teardown().wipe()

        assertThat(db.keyedJsonCacheDao().find("community:list", "k")).isNull()
        assertThat(db.cacheEntryDao().itemCount("ns")).isEqualTo(0)
    }

    /**
     * #14655 — the vault outlives the session, so do the erasures it still owes to an account (identifiers only, stamped
     * with their account) ; an unstamped row could be drained by the next account, so it goes.
     */
    @Test
    fun wipe_keepsThePlaintextErasuresOwedToAnAccount() = runTest {
        val erasures = db.plaintextErasureDao()
        erasures.recordMessages(
            listOf(
                me.meeshy.core.database.entity.PlaintextErasureEntity("alice", "message", "m1", "cid_1", "alice", recordedAt = 1L),
                me.meeshy.core.database.entity.PlaintextErasureEntity("", "message", "m2", recordedAt = 1L),
            ),
        )

        teardown().wipe()

        assertThat(erasures.pending("alice", 10).map { it.itemId to it.clientMessageId }).containsExactly("m1" to "cid_1")
        assertThat(erasures.pending("bob", 10)).isEmpty()
    }

    @Test
    fun wipe_passesThroughTheCacheStoreRegistryAndDropsItsMemory() = runTest {
        val registry = me.meeshy.sdk.cache.store.CacheStoreRegistry(kotlinx.coroutines.Dispatchers.Unconfined)
        val store = registry.roomStore(
            db.cacheEntryDao(), "registry-ns", me.meeshy.sdk.cache.CachePolicy(1_000, 10_000, 10),
            kotlinx.serialization.serializer<String>(), { it },
        )
        store.save(listOf("a"), "k")
        store.load("k")

        teardown(perAccountCaches = setOf(registry)).wipe()

        assertThat(store.load("k")).isEqualTo(me.meeshy.sdk.cache.CacheResult.Empty)
    }

    @Test
    fun wipeAfterServerInvalidation_withPendingSendsWarnsOfTheLoss() = runTest {
        val toasts = me.meeshy.sdk.feedback.FeedbackToastCenter()
        outboxRepository.enqueue(pendingSend())

        teardown(lostSends = notifier(toasts)).wipeAfterServerInvalidation()

        assertThat(toasts.current.value?.message).isEqualTo("perdus:1")
        assertThat(outboxRepository.observeAll().first()).isEmpty()
    }

    @Test
    fun wipeAfterServerInvalidation_withAnEmptyQueueStaysSilentButStillPurges() = runTest {
        val toasts = me.meeshy.sdk.feedback.FeedbackToastCenter()
        val cache = RecordingCache()

        teardown(lostSends = notifier(toasts), perAccountCaches = setOf(cache)).wipeAfterServerInvalidation()

        assertThat(toasts.current.value).isNull()
        assertThat(cache.clears).isEqualTo(1)
    }

    @Test
    fun voluntaryWipe_neverWarnsEvenWithPendingSends() = runTest {
        val toasts = me.meeshy.sdk.feedback.FeedbackToastCenter()
        outboxRepository.enqueue(pendingSend())

        teardown(lostSends = notifier(toasts)).wipe()

        assertThat(toasts.current.value).isNull()
        assertThat(outboxRepository.observeAll().first()).isEmpty()
    }

    @Test
    fun wipe_deletesTheUnencryptedDatabaseCopiesLeftByARecovery() = runTest {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val primary = context.getDatabasePath("teardown-leftovers.db").also { it.parentFile?.mkdirs() }
        val quarantined = java.io.File(primary.path + ".corrupted.7").apply { writeText("history of A") }
        val fallback = java.io.File(context.cacheDir, "teardown-fallback.db").apply { writeText("history of A") }
        val leftovers = me.meeshy.core.database.DatabaseLeftovers(primary, fallback)

        teardown(perAccountCaches = setOf(DatabaseLeftoversTeardown(leftovers))).wipe()

        assertThat(quarantined.exists()).isFalse()
        assertThat(fallback.exists()).isFalse()
    }

    @Test
    fun wipe_duringAnInMemoryLaunchLeavesTheDiskDatabasePurgeDue() = runTest {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val primary = context.getDatabasePath("teardown-memory-launch.db").also { it.parentFile?.mkdirs() }
        primary.writeText("history of A, still on disk")
        val leftovers = me.meeshy.core.database.DatabaseLeftovers(primary, java.io.File(context.cacheDir, "absent-memory.db"))
        leftovers.markInUse(null)

        teardown(perAccountCaches = setOf(DatabaseLeftoversTeardown(leftovers))).wipe()

        assertThat(me.meeshy.core.database.PendingDiskPurge.isDue(primary)).isTrue()
    }

    @Test
    fun wipe_aCorruptionMarkerLeftOnAFileTheVacuumHealedIsCleared() = runTest {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        db.close()
        db = Room.databaseBuilder(context, MeeshyDatabase::class.java, "teardown-marker.db").allowMainThreadQueries().build()
        val file = java.io.File(requireNotNull(db.openHelper.writableDatabase.path))
        me.meeshy.core.database.DatabaseRecovery.markCorrupted(file)

        teardown().wipe()

        assertThat(me.meeshy.core.database.DatabaseRecovery.isMarkedCorrupted(file)).isFalse()
    }

    @Test
    fun wipeAfterServerInvalidation_aDeletedAccountLeavesNoDatabaseCopyBehind() = runTest {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val primary = context.getDatabasePath("deleted-leftovers.db").also { it.parentFile?.mkdirs() }
        val quarantined = java.io.File(primary.path + ".corrupted.8-wal").apply { writeText("history of A") }
        val leftovers = me.meeshy.core.database.DatabaseLeftovers(primary, java.io.File(context.cacheDir, "absent.db"))

        teardown(perAccountCaches = setOf(DatabaseLeftoversTeardown(leftovers))).wipeAfterServerInvalidation()

        assertThat(quarantined.exists()).isFalse()
    }

    @Test
    fun wipeIfStillSignedOut_rereadsTheSessionUnderTheFenceAndSparesOneRestoredMeanwhile() = runTest {
        val fence = AccountFence(me.meeshy.sdk.outbox.OutboxOwnerSource { "A" })
        var restored = false
        outboxRepository.enqueue(pendingSend())
        val started = kotlinx.coroutines.CompletableDeferred<Unit>()
        val send = launch {
            fence.guard(fence.ticket()) {
                started.complete(Unit)
                try {
                    kotlinx.coroutines.awaitCancellation()
                } finally {
                    restored = true
                }
            }
        }
        started.await()

        val purged = teardown(fence = fence).wipeIfStillSignedOut { !restored }

        assertThat(purged).isFalse()
        assertThat(outboxRepository.observeAll().first()).isNotEmpty()
        send.join()
    }

    @Test
    fun wipeIfStillSignedOut_purgesADeviceThatIsStillSignedOut() = runTest {
        outboxRepository.enqueue(pendingSend())

        val purged = teardown(fence = AccountFence(me.meeshy.sdk.outbox.OutboxOwnerSource { null }))
            .wipeIfStillSignedOut { true }

        assertThat(purged).isTrue()
        assertThat(outboxRepository.observeAll().first()).isEmpty()
    }

    @Test
    fun wipeIfStillSignedOut_aRefusedPurgeLeavesTheAccountGenerationAsItWas() = runTest {
        val fence = AccountFence(me.meeshy.sdk.outbox.OutboxOwnerSource { "A" })
        val before = fence.ticket()
        outboxRepository.enqueue(pendingSend())

        val purged = teardown(fence = fence).wipeIfStillSignedOut { false }

        assertThat(purged).isFalse()
        assertThat(fence.isCurrent(before)).isTrue()
        assertThat(outboxRepository.observeAll().first()).isNotEmpty()
    }

    @Test
    fun `la deconnexion vide la copie en memoire des traductions retenues`() = runTest {
        val layer = me.meeshy.sdk.conversation.TranslationLayer.of(db)
        layer.saveText("m1", me.meeshy.sdk.model.StoredTextTranslation("m1", "fr", "Bonjour de A"), 1L)
        check(layer.heldMessageCount() > 0)

        teardown().wipe()

        assertThat(layer.heldMessageCount()).isEqualTo(0)
        assertThat(db.messageTranslationDao().textsFor(listOf("m1"))).isEmpty()
    }
}
