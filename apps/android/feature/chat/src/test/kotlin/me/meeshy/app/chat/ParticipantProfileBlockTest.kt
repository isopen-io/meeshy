package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.plus
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.friend.BlockActionCoordinator
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.BlockFailure
import me.meeshy.sdk.model.people.BlockEntry
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ParticipantProfileBlockTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before fun setUp() { Dispatchers.setMain(dispatcher) }
    @After fun tearDown() { Dispatchers.resetMain() }

    private class Rig(val cache: BlockCache = BlockCache()) {
        val failures = MutableSharedFlow<BlockFailure>(extraBufferCapacity = 4)
        val coordinator = mockk<BlockActionCoordinator>(relaxed = true).also {
            every { it.failures } returns failures
            coEvery { it.setBlocked(any(), any()) } answers { cache.setBlocked(firstArg(), secondArg()) }
        }
        val session = mockk<SessionRepository>().also { every { it.currentUserId } returns "me" }
        val viewModel = ParticipantBlockViewModel(cache, coordinator, session)
    }

    private fun kotlinx.coroutines.test.TestScope.watch(rig: Rig) {
        rig.viewModel.state.launchIn(backgroundScope + dispatcher)
    }

    @Test
    fun `another registered participant offers Block`() = runTest {
        val rig = Rig().also { watch(it) }
        rig.viewModel.bind("u2", isAnonymous = false)
        assertThat(rig.viewModel.state.value.entry).isEqualTo(BlockEntry.BLOCK)
    }

    @Test
    fun `oneself and a visitor without account offer nothing`() = runTest {
        val rig = Rig().also { watch(it) }
        rig.viewModel.bind("me", isAnonymous = false)
        assertThat(rig.viewModel.state.value.entry).isNull()
        rig.viewModel.bind("u2", isAnonymous = true)
        assertThat(rig.viewModel.state.value.entry).isNull()
    }

    @Test
    fun `blocking asks for confirmation and writes nothing until confirmed`() = runTest {
        val rig = Rig().also { watch(it) }
        rig.viewModel.bind("u2", isAnonymous = false)
        rig.viewModel.onEntryTapped()
        assertThat(rig.viewModel.state.value.confirming).isTrue()
        coVerify(exactly = 0) { rig.coordinator.setBlocked(any(), any()) }

        rig.viewModel.confirmBlock()

        coVerify { rig.coordinator.setBlocked("u2", true) }
        assertThat(rig.viewModel.state.value.entry).isEqualTo(BlockEntry.UNBLOCK)
        assertThat(rig.viewModel.state.value.confirming).isFalse()
    }

    @Test
    fun `dismissing the confirmation blocks nobody`() = runTest {
        val rig = Rig().also { watch(it) }
        rig.viewModel.bind("u2", isAnonymous = false)
        rig.viewModel.onEntryTapped()
        rig.viewModel.dismissConfirmation()
        coVerify(exactly = 0) { rig.coordinator.setBlocked(any(), any()) }
        assertThat(rig.viewModel.state.value.entry).isEqualTo(BlockEntry.BLOCK)
    }

    @Test
    fun `unblocking is direct`() = runTest {
        val rig = Rig().also { it.cache.setBlocked("u2", true); watch(it) }
        rig.viewModel.bind("u2", isAnonymous = false)
        rig.viewModel.onEntryTapped()
        coVerify { rig.coordinator.setBlocked("u2", false) }
        assertThat(rig.viewModel.state.value.entry).isEqualTo(BlockEntry.BLOCK)
    }

    @Test
    fun `a definitive failure on this person is reported once and the state is restored`() = runTest {
        val rig = Rig().also { watch(it) }
        rig.viewModel.bind("u2", isAnonymous = false)
        val seen = mutableListOf<ParticipantBlockEffect>()
        rig.viewModel.effectFlow.onEach { seen += it }.launchIn(backgroundScope + dispatcher)

        rig.failures.emit(BlockFailure("other", wasBlocking = true))
        rig.failures.emit(BlockFailure("u2", wasBlocking = true))

        assertThat(seen).containsExactly(ParticipantBlockEffect.Failed(wasBlocking = true))
        assertThat(rig.viewModel.state.value.entry).isEqualTo(BlockEntry.BLOCK)
    }
}
