package me.meeshy.app.feed

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.SocketStatusCreatedData
import me.meeshy.sdk.model.SocketStatusDeletedData
import me.meeshy.sdk.model.SocketStatusReactedData
import me.meeshy.sdk.model.SocketStatusUpdatedData
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.status.StatusBarCache
import me.meeshy.sdk.status.StatusBarCacheRepository
import me.meeshy.sdk.status.StatusFeedMode
import me.meeshy.sdk.status.StatusPage
import me.meeshy.sdk.status.StatusRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class StatusesViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        // Cold disk by default (matches the production repository's `null` on a never-cached
        // feed); relaxed mockk would otherwise hand back an empty list and falsely seed the bar.
        coEvery { diskCache.cachedBar(any()) } returns null
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val repository: StatusRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val diskCache: StatusBarCacheRepository = mockk(relaxed = true)
    private val socialSocket: SocialSocketManager = mockk(relaxed = true)
    private val statusCreatedFlow = MutableSharedFlow<SocketStatusCreatedData>(extraBufferCapacity = 8)
    private val statusUpdatedFlow = MutableSharedFlow<SocketStatusUpdatedData>(extraBufferCapacity = 8)
    private val statusDeletedFlow = MutableSharedFlow<SocketStatusDeletedData>(extraBufferCapacity = 8)
    private val statusReactedFlow = MutableSharedFlow<SocketStatusReactedData>(extraBufferCapacity = 8)

    private class FakeClock(var now: Long = 0L) : CacheClock {
        override fun nowMillis(): Long = now
    }

    private fun entry(id: String, userId: String = "u-$id", emoji: String = "😀") =
        StatusEntry(id = id, userId = userId, moodEmoji = emoji)

    private fun apiStatus(id: String, userId: String, emoji: String = "😀", content: String? = null) =
        ApiPost(
            id = id,
            type = "STATUS",
            moodEmoji = emoji,
            content = content,
            author = ApiAuthor(id = userId, username = "user-$userId"),
        )

    private fun page(vararg entries: StatusEntry, nextCursor: String? = null, hasMore: Boolean = false) =
        NetworkResult.Success(StatusPage(entries.toList(), nextCursor, hasMore))

    private fun user(id: String) = MeeshyUser(id = id, username = "me")

    private fun viewModel(
        currentUser: MeeshyUser? = null,
        cache: StatusBarCache = StatusBarCache(FakeClock()),
    ): StatusesViewModel {
        every { session.currentUser } returns MutableStateFlow(currentUser)
        every { socialSocket.statusCreated } returns statusCreatedFlow
        every { socialSocket.statusUpdated } returns statusUpdatedFlow
        every { socialSocket.statusDeleted } returns statusDeletedFlow
        every { socialSocket.statusReacted } returns statusReactedFlow
        return StatusesViewModel(repository, session, cache, diskCache, socialSocket)
    }

    @Test
    fun `loadInitial populates the bar from the first page`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("a"), entry("b"), hasMore = false)

        val vm = viewModel()

        vm.state.test {
            val s = awaitItem()
            assertThat(s.statuses.map { it.id }).containsExactly("a", "b").inOrder()
            assertThat(s.showSkeleton).isFalse()
            assertThat(s.hasMore).isFalse()
            assertThat(s.errorMessage).isNull()
        }
    }

    @Test
    fun `cold load shows a skeleton until the first page arrives`() = runTest {
        val gate = CompletableDeferred<NetworkResult<StatusPage>>()
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } coAnswers { gate.await() }

        val vm = viewModel()

        vm.state.test {
            assertThat(awaitItem().showSkeleton).isTrue()
            gate.complete(page(entry("a")))
            val settled = awaitItem()
            assertThat(settled.showSkeleton).isFalse()
            assertThat(settled.statuses.map { it.id }).containsExactly("a")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `loadInitial failure surfaces the error and hides the skeleton`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            NetworkResult.Failure(ApiError("boom"))

        val vm = viewModel()

        vm.state.test {
            val s = awaitItem()
            assertThat(s.errorMessage).isEqualTo("boom")
            assertThat(s.showSkeleton).isFalse()
            assertThat(s.statuses).isEmpty()
        }
    }

    @Test
    fun `loadInitial is guarded once the bar has loaded`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("a"), hasMore = false)

        val vm = viewModel()
        vm.loadInitial()

        coVerify(exactly = 1) { repository.list(any(), any(), any()) }
    }

    @Test
    fun `the signed-in user's own status is projected first and as myStatus`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("a", userId = "other"), entry("mine", userId = "me-id"), hasMore = false)

        val vm = viewModel(currentUser = user("me-id"))

        vm.state.test {
            val s = awaitItem()
            assertThat(s.statuses.map { it.id }).containsExactly("mine", "a").inOrder()
            assertThat(s.myStatus?.id).isEqualTo("mine")
        }
    }

    @Test
    fun `discover mode never surfaces a myStatus`() = runTest {
        coEvery { repository.list(StatusFeedMode.DISCOVER, null, any()) } returns
            page(entry("mine", userId = "me-id"), hasMore = false)

        val vm = viewModel(currentUser = user("me-id"))
        vm.setMode(StatusFeedMode.DISCOVER)

        vm.state.test {
            val s = awaitItem()
            assertThat(s.mode).isEqualTo(StatusFeedMode.DISCOVER)
            assertThat(s.myStatus).isNull()
        }
        coVerify(exactly = 1) { repository.list(StatusFeedMode.DISCOVER, null, any()) }
    }

    @Test
    fun `setMode to the active mode is inert`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("a"), hasMore = false)

        val vm = viewModel()
        vm.setMode(StatusFeedMode.FRIENDS)

        coVerify(exactly = 1) { repository.list(any(), any(), any()) }
    }

    @Test
    fun `loadMoreIfNeeded fetches and appends the next page near the tail`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("a"), entry("b"), entry("c"), nextCursor = "c2", hasMore = true)
        coEvery { repository.list(StatusFeedMode.FRIENDS, "c2", any()) } returns
            page(entry("d"), entry("e"), hasMore = false)

        val vm = viewModel()
        vm.loadMoreIfNeeded("c")

        vm.state.test {
            assertThat(awaitItem().statuses.map { it.id })
                .containsExactly("a", "b", "c", "d", "e").inOrder()
        }
        coVerify(exactly = 1) { repository.list(StatusFeedMode.FRIENDS, "c2", any()) }
    }

    @Test
    fun `loadMoreIfNeeded is inert when no further pages remain`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("a"), entry("b"), entry("c"), nextCursor = null, hasMore = false)

        val vm = viewModel()
        vm.loadMoreIfNeeded("c")

        coVerify(exactly = 1) { repository.list(any(), any(), any()) }
    }

    @Test
    fun `setStatus prepends the created status to the bar`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("a"), hasMore = false)
        coEvery { repository.create(any(), any(), any(), any(), any(), any()) } returns
            NetworkResult.Success(entry("new", userId = "me-id", emoji = "🔥"))

        val vm = viewModel(currentUser = user("me-id"))
        vm.setStatus(emoji = "🔥")

        vm.state.test {
            val s = awaitItem()
            assertThat(s.statuses.map { it.id }).containsExactly("new", "a").inOrder()
            assertThat(s.myStatus?.id).isEqualTo("new")
        }
        coVerify(exactly = 1) { repository.create("🔥", null, "PUBLIC", null, null, null) }
    }

    @Test
    fun `setStatus forwards the repost attribution when republishing`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("a"), hasMore = false)
        coEvery { repository.create(any(), any(), any(), any(), any(), any()) } returns
            NetworkResult.Success(entry("re", userId = "me-id", emoji = "🎉"))

        val vm = viewModel(currentUser = user("me-id"))
        vm.setStatus(
            emoji = "🎉",
            content = "party time",
            audioUrl = "https://cdn/mood.m4a",
            repostOfId = "src-1",
            viaUsername = "alice",
        )

        vm.state.test {
            assertThat(awaitItem().statuses.map { it.id }).containsExactly("re", "a").inOrder()
        }
        coVerify(exactly = 1) {
            repository.create("🎉", "party time", "PUBLIC", "https://cdn/mood.m4a", "src-1", "alice")
        }
    }

    @Test
    fun `setStatus failure surfaces the error and leaves the bar unchanged`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("a"), hasMore = false)
        coEvery { repository.create(any(), any(), any(), any(), any(), any()) } returns
            NetworkResult.Failure(ApiError("nope"))

        val vm = viewModel()
        vm.setStatus(emoji = "🔥")

        vm.state.test {
            val s = awaitItem()
            assertThat(s.statuses.map { it.id }).containsExactly("a")
            assertThat(s.errorMessage).isEqualTo("nope")
        }
    }

    @Test
    fun `clearStatus optimistically drops the own status and persists it`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("mine", userId = "me-id"), entry("a", userId = "other"), hasMore = false)
        coEvery { repository.delete("mine") } returns NetworkResult.Success(Unit)

        val vm = viewModel(currentUser = user("me-id"))
        vm.clearStatus()

        vm.state.test {
            val s = awaitItem()
            assertThat(s.statuses.map { it.id }).containsExactly("a")
            assertThat(s.myStatus).isNull()
        }
        coVerify(exactly = 1) { repository.delete("mine") }
    }

    @Test
    fun `clearStatus rolls back when the delete fails`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("mine", userId = "me-id"), hasMore = false)
        coEvery { repository.delete("mine") } returns NetworkResult.Failure(ApiError("down"))

        val vm = viewModel(currentUser = user("me-id"))
        vm.clearStatus()

        vm.state.test {
            val s = awaitItem()
            assertThat(s.statuses.map { it.id }).containsExactly("mine")
            assertThat(s.myStatus?.id).isEqualTo("mine")
            assertThat(s.errorMessage).isEqualTo("down")
        }
    }

    @Test
    fun `clearStatus is inert when the user has no own status`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("a", userId = "other"), hasMore = false)

        val vm = viewModel(currentUser = user("me-id"))
        vm.clearStatus()

        coVerify(exactly = 0) { repository.delete(any()) }
    }

    @Test
    fun `react optimistically bumps the reaction and persists it`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("a", userId = "other"), hasMore = false)
        coEvery { repository.react("a", "❤️") } returns NetworkResult.Success(Unit)

        val vm = viewModel()
        vm.react("a", "❤️")

        vm.state.test {
            val s = awaitItem()
            assertThat(s.statuses.first().reactionSummary).containsExactly("❤️", 1)
        }
        coVerify(exactly = 1) { repository.react("a", "❤️") }
    }

    @Test
    fun `react rolls the bump back when the network fails`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("a", userId = "other"), hasMore = false)
        coEvery { repository.react("a", "❤️") } returns NetworkResult.Failure(ApiError("rip"))

        val vm = viewModel()
        vm.react("a", "❤️")

        vm.state.test {
            val s = awaitItem()
            assertThat(s.statuses.first().reactionSummary).isNull()
            assertThat(s.errorMessage).isEqualTo("rip")
        }
    }

    @Test
    fun `react is inert for a status not in the bar`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("a"), hasMore = false)

        val vm = viewModel()
        vm.react("zzz", "❤️")

        coVerify(exactly = 0) { repository.react(any(), any()) }
    }

    @Test
    fun `refresh resets the bar and reloads the first page`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returnsMany
            listOf(page(entry("a"), entry("b"), hasMore = false), page(entry("x"), hasMore = false))

        val vm = viewModel()
        vm.refresh()

        vm.state.test {
            assertThat(awaitItem().statuses.map { it.id }).containsExactly("x")
        }
        coVerify(exactly = 2) { repository.list(StatusFeedMode.FRIENDS, null, any()) }
    }

    // MARK: - L1 cache (cache-first, network-second)

    @Test
    fun `a fresh cached bar is served instantly without any network fetch`() = runTest {
        val clock = FakeClock(now = 0L)
        val warm = StatusBarCache(clock)
        warm.save(StatusFeedMode.FRIENDS, listOf(entry("cached")))
        clock.now = 30_000L

        val vm = viewModel(cache = warm)

        vm.state.test {
            val s = awaitItem()
            assertThat(s.statuses.map { it.id }).containsExactly("cached")
            assertThat(s.showSkeleton).isFalse()
        }
        coVerify(exactly = 0) { repository.list(any(), any(), any()) }
    }

    @Test
    fun `a stale cached bar paints instantly then the network first page replaces it`() = runTest {
        val gate = CompletableDeferred<NetworkResult<StatusPage>>()
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } coAnswers { gate.await() }
        val clock = FakeClock(now = 0L)
        val warm = StatusBarCache(clock)
        warm.save(StatusFeedMode.FRIENDS, listOf(entry("cached")))
        clock.now = 120_000L

        val vm = viewModel(cache = warm)

        vm.state.test {
            val seeded = awaitItem()
            assertThat(seeded.statuses.map { it.id }).containsExactly("cached")
            assertThat(seeded.showSkeleton).isFalse()

            gate.complete(page(entry("net"), hasMore = false))
            val settled = awaitItem()
            assertThat(settled.statuses.map { it.id }).containsExactly("net")
            cancelAndIgnoreRemainingEvents()
        }
        coVerify(exactly = 1) { repository.list(StatusFeedMode.FRIENDS, null, any()) }
    }

    @Test
    fun `the first network page is written through to the cache for the next cold paint`() = runTest {
        val clock = FakeClock(now = 0L)
        val shared = StatusBarCache(clock)
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("a"), hasMore = false)

        viewModel(cache = shared)
        val reopened = viewModel(cache = shared)

        reopened.state.test {
            assertThat(awaitItem().statuses.map { it.id }).containsExactly("a")
        }
        coVerify(exactly = 1) { repository.list(StatusFeedMode.FRIENDS, null, any()) }
    }

    @Test
    fun `switching to an already-cached mode paints it instantly without a fetch`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("f"), hasMore = false)
        val shared = StatusBarCache(FakeClock())
        shared.save(StatusFeedMode.DISCOVER, listOf(entry("disc")))

        val vm = viewModel(cache = shared)
        vm.setMode(StatusFeedMode.DISCOVER)

        vm.state.test {
            val s = awaitItem()
            assertThat(s.mode).isEqualTo(StatusFeedMode.DISCOVER)
            assertThat(s.statuses.map { it.id }).containsExactly("disc")
        }
        coVerify(exactly = 0) { repository.list(StatusFeedMode.DISCOVER, null, any()) }
    }

    @Test
    fun `refresh bypasses a fresh cache and forces a network reload`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("net"), hasMore = false)
        val warm = StatusBarCache(FakeClock())
        warm.save(StatusFeedMode.FRIENDS, listOf(entry("cached")))

        val vm = viewModel(cache = warm)
        vm.refresh()

        vm.state.test {
            assertThat(awaitItem().statuses.map { it.id }).containsExactly("net")
        }
        coVerify(exactly = 1) { repository.list(StatusFeedMode.FRIENDS, null, any()) }
    }

    @Test
    fun `a published status is written through to the cache`() = runTest {
        val clock = FakeClock(now = 0L)
        val shared = StatusBarCache(clock)
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("a"), hasMore = false)
        coEvery { repository.create(any(), any(), any(), any(), any(), any()) } returns
            NetworkResult.Success(entry("new", userId = "me-id", emoji = "🔥"))

        val vm = viewModel(currentUser = user("me-id"), cache = shared)
        vm.setStatus(emoji = "🔥")

        val cached = (shared.load(StatusFeedMode.FRIENDS) as CacheResult.Fresh).value
        assertThat(cached.map { it.id }).containsExactly("new", "a").inOrder()
    }

    @Test
    fun `clearing the own status is written through to the cache`() = runTest {
        val shared = StatusBarCache(FakeClock())
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("mine", userId = "me-id"), entry("a", userId = "other"), hasMore = false)
        coEvery { repository.delete("mine") } returns NetworkResult.Success(Unit)

        val vm = viewModel(currentUser = user("me-id"), cache = shared)
        vm.clearStatus()

        val cached = (shared.load(StatusFeedMode.FRIENDS) as CacheResult.Fresh).value
        assertThat(cached.map { it.id }).containsExactly("a")
    }

    // MARK: - L2 disk cache (cold-launch parity across process death)

    @Test
    fun `a cold launch seeds the bar from the disk cache before the network answers`() = runTest {
        val gate = CompletableDeferred<NetworkResult<StatusPage>>()
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } coAnswers { gate.await() }
        coEvery { diskCache.cachedBar(StatusFeedMode.FRIENDS) } returns listOf(entry("disk-a"), entry("disk-b"))

        val vm = viewModel()

        vm.state.test {
            val seeded = awaitItem()
            assertThat(seeded.statuses.map { it.id }).containsExactly("disk-a", "disk-b").inOrder()
            assertThat(seeded.showSkeleton).isFalse()

            gate.complete(page(entry("net"), hasMore = false))
            assertThat(awaitItem().statuses.map { it.id }).containsExactly("net")
            cancelAndIgnoreRemainingEvents()
        }
        coVerify(exactly = 1) { repository.list(StatusFeedMode.FRIENDS, null, any()) }
    }

    @Test
    fun `a cold launch with a cold disk consults it then shows the skeleton`() = runTest {
        val gate = CompletableDeferred<NetworkResult<StatusPage>>()
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } coAnswers { gate.await() }
        coEvery { diskCache.cachedBar(StatusFeedMode.FRIENDS) } returns null

        val vm = viewModel()

        vm.state.test {
            assertThat(awaitItem().showSkeleton).isTrue()
            cancelAndIgnoreRemainingEvents()
        }
        coVerify(exactly = 1) { diskCache.cachedBar(StatusFeedMode.FRIENDS) }
    }

    @Test
    fun `the first network page is written through to the disk cache`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("a"), entry("b"), hasMore = false)

        val vm = viewModel()

        vm.state.test {
            assertThat(awaitItem().statuses.map { it.id }).containsExactly("a", "b").inOrder()
        }
        coVerify(exactly = 1) {
            diskCache.persistBar(StatusFeedMode.FRIENDS, match { it.map { e -> e.id } == listOf("a", "b") })
        }
    }

    @Test
    fun `a warm L1 cache never touches the disk tier`() = runTest {
        val clock = FakeClock(now = 0L)
        val warm = StatusBarCache(clock)
        warm.save(StatusFeedMode.FRIENDS, listOf(entry("cached")))
        clock.now = 30_000L

        val vm = viewModel(cache = warm)

        vm.state.test {
            assertThat(awaitItem().statuses.map { it.id }).containsExactly("cached")
        }
        coVerify(exactly = 0) { diskCache.cachedBar(any()) }
    }

    @Test
    fun `refresh invalidates the disk row then writes the fresh page through`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("net"), hasMore = false)
        val warm = StatusBarCache(FakeClock())
        warm.save(StatusFeedMode.FRIENDS, listOf(entry("cached")))

        val vm = viewModel(cache = warm)
        vm.refresh()

        vm.state.test {
            assertThat(awaitItem().statuses.map { it.id }).containsExactly("net")
        }
        coVerify(exactly = 1) { diskCache.invalidate(StatusFeedMode.FRIENDS) }
        coVerify(exactly = 1) {
            diskCache.persistBar(StatusFeedMode.FRIENDS, match { it.map { e -> e.id } == listOf("net") })
        }
    }

    @Test
    fun `a published status is written through to the disk cache`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("a"), hasMore = false)
        coEvery { repository.create(any(), any(), any(), any(), any(), any()) } returns
            NetworkResult.Success(entry("new", userId = "me-id", emoji = "🔥"))

        val vm = viewModel(currentUser = user("me-id"))
        vm.setStatus(emoji = "🔥")

        coVerify(exactly = 1) {
            diskCache.persistBar(StatusFeedMode.FRIENDS, match { it.map { e -> e.id } == listOf("new", "a") })
        }
    }

    @Test
    fun `clearing the own status is written through to the disk cache`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("mine", userId = "me-id"), entry("a", userId = "other"), hasMore = false)
        coEvery { repository.delete("mine") } returns NetworkResult.Success(Unit)

        val vm = viewModel(currentUser = user("me-id"))
        vm.clearStatus()

        coVerify(exactly = 1) {
            diskCache.persistBar(StatusFeedMode.FRIENDS, match { it.map { e -> e.id } == listOf("a") })
        }
    }

    @Test
    fun `a failed clear rolls back and never writes the removal through to disk`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("mine", userId = "me-id"), entry("a", userId = "other"), hasMore = false)
        coEvery { repository.delete("mine") } returns
            NetworkResult.Failure(ApiError("boom"))

        val vm = viewModel(currentUser = user("me-id"))
        vm.clearStatus()

        vm.state.test {
            assertThat(awaitItem().statuses.map { it.id }).containsExactly("mine", "a").inOrder()
        }
        coVerify(exactly = 0) { diskCache.persistBar(any(), match { it.none { e -> e.id == "mine" } }) }
    }

    // --- Realtime socket wiring (parity with iOS StatusViewModel.subscribeToSocketEvents) ---

    @Test
    fun `a status created socket event hoists the new mood to the front of the bar`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("a"), hasMore = false)

        val vm = viewModel()
        statusCreatedFlow.emit(SocketStatusCreatedData(status = apiStatus(id = "new", userId = "friend", emoji = "🔥")))

        assertThat(vm.state.value.statuses.map { it.id }).containsExactly("new", "a").inOrder()
    }

    @Test
    fun `a status created echo of an already-present status leaves it in place`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("b"), entry("a"), hasMore = false)

        val vm = viewModel()
        statusCreatedFlow.emit(SocketStatusCreatedData(status = apiStatus(id = "a", userId = "u-a")))

        // Present already: neither duplicated nor hoisted to the front (iOS `if !contains`).
        assertThat(vm.state.value.statuses.map { it.id }).containsExactly("b", "a").inOrder()
    }

    @Test
    fun `a status created payload that is not a mood status is ignored`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("a"), hasMore = false)

        val vm = viewModel()
        statusCreatedFlow.emit(SocketStatusCreatedData(status = ApiPost(id = "p1", type = "POST")))

        assertThat(vm.state.value.statuses.map { it.id }).containsExactly("a")
    }

    @Test
    fun `a status updated socket event replaces the mood in place`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("a", emoji = "😀"), entry("b"), hasMore = false)

        val vm = viewModel()
        statusUpdatedFlow.emit(
            SocketStatusUpdatedData(status = apiStatus(id = "a", userId = "u-a", emoji = "🎉", content = "edited")),
        )

        val updated = vm.state.value.statuses.first { it.id == "a" }
        assertThat(vm.state.value.statuses.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(updated.moodEmoji).isEqualTo("🎉")
        assertThat(updated.content).isEqualTo("edited")
    }

    @Test
    fun `a status updated for a mood not in the bar is inert`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("a"), hasMore = false)

        val vm = viewModel()
        statusUpdatedFlow.emit(SocketStatusUpdatedData(status = apiStatus(id = "zzz", userId = "u-z")))

        assertThat(vm.state.value.statuses.map { it.id }).containsExactly("a")
    }

    @Test
    fun `a status deleted socket event drops the mood from the bar`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("a"), entry("b"), hasMore = false)

        val vm = viewModel()
        statusDeletedFlow.emit(SocketStatusDeletedData(statusId = "a", authorId = "u-a"))

        assertThat(vm.state.value.statuses.map { it.id }).containsExactly("b")
    }

    @Test
    fun `a status reacted socket event from another user bumps the reaction count`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("a"), hasMore = false)

        val vm = viewModel(currentUser = user("me-id"))
        statusReactedFlow.emit(SocketStatusReactedData(statusId = "a", userId = "someone-else", emoji = "❤️"))

        assertThat(vm.state.value.statuses.first { it.id == "a" }.reactionSummary)
            .containsExactly("❤️", 1)
    }

    @Test
    fun `a status reacted echo of the viewer's own reaction is ignored`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("a", userId = "me-id"), hasMore = false)

        val vm = viewModel(currentUser = user("me-id"))
        statusReactedFlow.emit(SocketStatusReactedData(statusId = "a", userId = "me-id", emoji = "❤️"))

        assertThat(vm.state.value.statuses.first { it.id == "a" }.reactionSummary).isNull()
    }
}
