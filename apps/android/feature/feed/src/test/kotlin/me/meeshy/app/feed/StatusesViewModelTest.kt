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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
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
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val repository: StatusRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)

    private fun entry(id: String, userId: String = "u-$id", emoji: String = "😀") =
        StatusEntry(id = id, userId = userId, moodEmoji = emoji)

    private fun page(vararg entries: StatusEntry, nextCursor: String? = null, hasMore: Boolean = false) =
        NetworkResult.Success(StatusPage(entries.toList(), nextCursor, hasMore))

    private fun user(id: String) = MeeshyUser(id = id, username = "me")

    private fun viewModel(currentUser: MeeshyUser? = null): StatusesViewModel {
        every { session.currentUser } returns MutableStateFlow(currentUser)
        return StatusesViewModel(repository, session)
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
        coEvery { repository.create(any(), any(), any(), any(), any()) } returns
            NetworkResult.Success(entry("new", userId = "me-id", emoji = "🔥"))

        val vm = viewModel(currentUser = user("me-id"))
        vm.setStatus(emoji = "🔥")

        vm.state.test {
            val s = awaitItem()
            assertThat(s.statuses.map { it.id }).containsExactly("new", "a").inOrder()
            assertThat(s.myStatus?.id).isEqualTo("new")
        }
        coVerify(exactly = 1) { repository.create("🔥", null, "PUBLIC", null, null) }
    }

    @Test
    fun `setStatus failure surfaces the error and leaves the bar unchanged`() = runTest {
        coEvery { repository.list(StatusFeedMode.FRIENDS, null, any()) } returns
            page(entry("a"), hasMore = false)
        coEvery { repository.create(any(), any(), any(), any(), any()) } returns
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
}
