package me.meeshy.app.startup

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import me.meeshy.sdk.lock.ConversationLockStore
import org.junit.Test

/** #13647 — the conversation-lock vault opens off the main thread, before the list's first frame asks for it. */
class OffMainWarmUpInitializerTest {

    private fun lockStore(): ConversationLockStore = mockk(relaxed = true) {
        every { lockedConversationIdsFlow } returns MutableStateFlow(emptySet())
    }

    @Test
    fun `initialize leaves the lock vault to the background dispatcher`() {
        val io = StandardTestDispatcher()
        val locks = lockStore()

        OffMainWarmUpInitializer(locks, io).initialize()

        verify(exactly = 0) { locks.lockedConversationIdsFlow }
        io.scheduler.advanceUntilIdle()
        verify(exactly = 1) { locks.lockedConversationIdsFlow }
    }

    @Test
    fun `an unreadable vault never escapes the warm-up`() {
        val io = StandardTestDispatcher()
        val locks = mockk<ConversationLockStore> {
            every { lockedConversationIdsFlow } throws IllegalStateException("keystore")
        }
        val escaped = mutableListOf<Throwable>()
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { _, failure -> escaped += failure }
        try {
            OffMainWarmUpInitializer(locks, io).initialize()
            io.scheduler.advanceUntilIdle()
        } finally {
            Thread.setDefaultUncaughtExceptionHandler(previous)
        }

        verify(exactly = 1) { locks.lockedConversationIdsFlow }
        assertThat(escaped).isEmpty()
    }

    @Test
    fun `it runs before every other initializer`() {
        val warmUp = OffMainWarmUpInitializer(lockStore(), StandardTestDispatcher())

        assertThat(warmUp.priority < 0).isTrue()
    }
}
