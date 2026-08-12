package me.meeshy.app.contacts

import androidx.work.WorkManager
import androidx.work.WorkRequest
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.friend.BlockRepository
import me.meeshy.sdk.model.friend.BlockedUser
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class BlockedListViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val repository: BlockRepository = mockk(relaxed = true)
    private val workManager: WorkManager = mockk(relaxed = true)

    private fun user(id: String, username: String = id) = BlockedUser(id = id, username = username)

    private fun viewModel() = BlockedListViewModel(repository, workManager)

    @Test
    fun `load populates the list and settles`() = runTest {
        coEvery { repository.listBlocked() } returns NetworkResult.Success(listOf(user("u1"), user("u2")))
        val vm = viewModel()

        vm.load()

        assertThat(vm.state.value.blocked.map { it.id }).containsExactly("u1", "u2").inOrder()
        assertThat(vm.state.value.isLoading).isFalse()
        assertThat(vm.state.value.showSkeleton).isFalse()
        assertThat(vm.state.value.isEmpty).isFalse()
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun `load with nobody blocked settles into the empty state`() = runTest {
        coEvery { repository.listBlocked() } returns NetworkResult.Success(emptyList())
        val vm = viewModel()

        vm.load()

        assertThat(vm.state.value.blocked).isEmpty()
        assertThat(vm.state.value.isEmpty).isTrue()
        assertThat(vm.state.value.showSkeleton).isFalse()
    }

    @Test
    fun `a failed load surfaces the error without the empty state`() = runTest {
        coEvery { repository.listBlocked() } returns NetworkResult.Failure(ApiError("boom"))
        val vm = viewModel()

        vm.load()

        assertThat(vm.state.value.errorMessage).isEqualTo("boom")
        assertThat(vm.state.value.isEmpty).isFalse()
        assertThat(vm.state.value.isLoading).isFalse()
    }

    @Test
    fun `showSkeleton is true only while a cold load is in flight`() = runTest {
        val gate = CompletableDeferred<NetworkResult<List<BlockedUser>>>()
        coEvery { repository.listBlocked() } coAnswers { gate.await() }
        val vm = viewModel()

        vm.load()
        assertThat(vm.state.value.showSkeleton).isTrue()

        gate.complete(NetworkResult.Success(listOf(user("u1"))))
        assertThat(vm.state.value.showSkeleton).isFalse()
    }

    @Test
    fun `unblock removes the row optimistically and enqueues a durable flush`() = runTest {
        coEvery { repository.listBlocked() } returns NetworkResult.Success(listOf(user("u1"), user("u2")))
        coEvery { repository.setBlockedDurably("u1", false) } returns "cmid1"
        val vm = viewModel()
        vm.load()

        vm.unblock("u1")

        assertThat(vm.state.value.blocked.map { it.id }).containsExactly("u2")
        assertThat(vm.state.value.pendingIds).isEmpty()
        coVerify(exactly = 1) { repository.setBlockedDurably("u1", false) }
        verify(exactly = 1) { workManager.enqueue(any<WorkRequest>()) }
    }

    @Test
    fun `an unblock whose enqueue coalesces away skips the flush`() = runTest {
        coEvery { repository.listBlocked() } returns NetworkResult.Success(listOf(user("u1")))
        // A null cmid means the enqueue annihilated a pending opposite — nothing to deliver.
        coEvery { repository.setBlockedDurably("u1", false) } returns null
        val vm = viewModel()
        vm.load()

        vm.unblock("u1")

        assertThat(vm.state.value.blocked).isEmpty()
        assertThat(vm.state.value.pendingIds).isEmpty()
        verify(exactly = 0) { workManager.enqueue(any<WorkRequest>()) }
    }

    @Test
    fun `a failed enqueue restores the removed row and surfaces the error`() = runTest {
        coEvery { repository.listBlocked() } returns NetworkResult.Success(listOf(user("u1"), user("u2")))
        coEvery { repository.setBlockedDurably("u1", false) } throws RuntimeException("nope")
        val vm = viewModel()
        vm.load()

        vm.unblock("u1")

        assertThat(vm.state.value.blocked.map { it.id }).containsExactly("u1", "u2").inOrder()
        assertThat(vm.state.value.pendingIds).isEmpty()
        assertThat(vm.state.value.errorMessage).isEqualTo("nope")
        verify(exactly = 0) { workManager.enqueue(any<WorkRequest>()) }
    }

    @Test
    fun `unblocking an unknown id is inert and never queues anything`() = runTest {
        coEvery { repository.listBlocked() } returns NetworkResult.Success(listOf(user("u1")))
        val vm = viewModel()
        vm.load()

        vm.unblock("ghost")

        assertThat(vm.state.value.blocked.map { it.id }).containsExactly("u1")
        coVerify(exactly = 0) { repository.setBlockedDurably("ghost", any()) }
        verify(exactly = 0) { workManager.enqueue(any<WorkRequest>()) }
    }

    @Test
    fun `a second unblock while one is in flight is guarded`() = runTest {
        coEvery { repository.listBlocked() } returns NetworkResult.Success(listOf(user("u1")))
        val gate = CompletableDeferred<String?>()
        coEvery { repository.setBlockedDurably("u1", false) } coAnswers { gate.await() }
        val vm = viewModel()
        vm.load()

        vm.unblock("u1") // suspends at the gate, u1 now pending
        vm.unblock("u1") // guarded — u1 already pending

        coVerify(exactly = 1) { repository.setBlockedDurably("u1", false) }
        assertThat(vm.state.value.pendingIds).containsExactly("u1")

        gate.complete("cmid1")
        assertThat(vm.state.value.pendingIds).isEmpty()
    }

    @Test
    fun `dismissError clears the error`() = runTest {
        coEvery { repository.listBlocked() } returns NetworkResult.Failure(ApiError("boom"))
        val vm = viewModel()
        vm.load()

        vm.dismissError()

        assertThat(vm.state.value.errorMessage).isNull()
    }
}
