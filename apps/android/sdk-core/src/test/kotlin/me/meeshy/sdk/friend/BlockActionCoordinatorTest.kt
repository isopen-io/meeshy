package me.meeshy.sdk.friend

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.outbox.OutboxOutcome
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class BlockActionCoordinatorTest {

    private class Rig(scope: CoroutineScope) {
        val cache = BlockCache()
        val repository: BlockRepository = mockk()
        val outbox: OutboxRepository = mockk()
        val outcomes = MutableSharedFlow<OutboxOutcome>(extraBufferCapacity = 16)
        val signalled = mutableListOf<String>()
        var flushes = 0
        var nextCmid = 0
        val coordinator: BlockActionCoordinator

        init {
            every { outbox.outcomes } returns outcomes
            coEvery { repository.setBlockedDurably(any(), any()) } answers {
                cache.setBlocked(firstArg(), secondArg())
                "cmid-${++nextCmid}"
            }
            coordinator = BlockActionCoordinator(
                repository,
                cache,
                outbox,
                { flushes++ },
                setOf(BlockSucceededObserver { signalled += it }),
                scope,
            )
        }
    }

    @Test
    fun `block flips the cache at once and wakes the flusher`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig(backgroundScope)

        rig.coordinator.block("u1")

        assertThat(rig.cache.isBlocked("u1")).isTrue()
        assertThat(rig.flushes).isEqualTo(1)
    }

    @Test
    fun `an exhausted block restores the previous state and emits a typed failure`() =
        runTest(UnconfinedTestDispatcher()) {
            val rig = Rig(backgroundScope)
            rig.coordinator.failures.test {
                rig.coordinator.block("u1")

                rig.outcomes.emit(OutboxOutcome.Exhausted("cmid-1", "boom"))

                assertThat(awaitItem()).isEqualTo(BlockFailure("u1", wasBlocking = true))
                assertThat(rig.cache.isBlocked("u1")).isFalse()
            }
        }

    @Test
    fun `an exhausted unblock restores the blocked state`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig(backgroundScope)
        rig.cache.setBlocked("u1", true)
        rig.coordinator.failures.test {
            rig.coordinator.unblock("u1")
            assertThat(rig.cache.isBlocked("u1")).isFalse()

            rig.outcomes.emit(OutboxOutcome.Exhausted("cmid-1", "boom"))

            assertThat(awaitItem()).isEqualTo(BlockFailure("u1", wasBlocking = false))
            assertThat(rig.cache.isBlocked("u1")).isTrue()
        }
    }

    @Test
    fun `a succeeded block keeps the state, emits no failure and signals the observers`() =
        runTest(UnconfinedTestDispatcher()) {
            val rig = Rig(backgroundScope)
            rig.coordinator.failures.test {
                rig.coordinator.block("u1")

                rig.outcomes.emit(OutboxOutcome.Succeeded("cmid-1"))

                assertThat(rig.cache.isBlocked("u1")).isTrue()
                assertThat(rig.signalled).containsExactly("u1")
                expectNoEvents()
            }
        }

    @Test
    fun `a cancelled toggle restores without any error`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig(backgroundScope)
        rig.coordinator.failures.test {
            rig.coordinator.block("u1")

            rig.outcomes.emit(OutboxOutcome.Cancelled("cmid-1"))

            assertThat(rig.cache.isBlocked("u1")).isFalse()
            expectNoEvents()
        }
    }

    @Test
    fun `block then unblock quickly - the last gesture wins whatever the earlier outcome`() =
        runTest(UnconfinedTestDispatcher()) {
            val rig = Rig(backgroundScope)
            coEvery { rig.repository.setBlockedDurably("u1", false) } answers {
                rig.cache.setBlocked("u1", false)
                null
            }
            rig.coordinator.failures.test {
                rig.coordinator.block("u1")
                rig.coordinator.unblock("u1")

                rig.outcomes.emit(OutboxOutcome.Cancelled("cmid-1"))
                rig.coordinator.block("u1")
                rig.outcomes.emit(OutboxOutcome.Cancelled("cmid-1"))

                assertThat(rig.cache.isBlocked("u1")).isTrue()
                expectNoEvents()
            }
        }

    @Test
    fun `a stale exhausted outcome never overrides a newer gesture`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig(backgroundScope)
        rig.coordinator.failures.test {
            rig.coordinator.block("u1")
            rig.coordinator.unblock("u1")

            rig.outcomes.emit(OutboxOutcome.Exhausted("cmid-1", "boom"))

            assertThat(rig.cache.isBlocked("u1")).isFalse()
            expectNoEvents()
        }
    }

    @Test
    fun `a failed enqueue restores at once and emits the failure`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig(backgroundScope)
        coEvery { rig.repository.setBlockedDurably("u1", true) } answers {
            rig.cache.setBlocked("u1", true)
            error("disk full")
        }
        rig.coordinator.failures.test {
            rig.coordinator.block("u1")

            assertThat(awaitItem()).isEqualTo(BlockFailure("u1", wasBlocking = true))
            assertThat(rig.cache.isBlocked("u1")).isFalse()
            assertThat(rig.flushes).isEqualTo(0)
        }
    }

    @Test
    fun `a blank id is inert`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig(backgroundScope)

        rig.coordinator.block("  ")

        assertThat(rig.cache.blockedCount).isEqualTo(0)
        assertThat(rig.flushes).isEqualTo(0)
    }
}
