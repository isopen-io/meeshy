package me.meeshy.sdk.sync

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheClock
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SyncSeqGapConversationsTest {

    @Test
    fun `un trou de sequence detecte avant enregistrement declenche la synchro des conversations`() = runTest {
        val tracker = SyncSeqTracker()
        var calls = 0
        val clock = object : CacheClock { override fun nowMillis() = 1_000_000L }
        val coordinator = ConversationSyncCoordinator(
            runner = { calls++; true },
            clock = clock,
            foregrounds = kotlinx.coroutines.flow.emptyFlow(),
            reconnections = kotlinx.coroutines.flow.emptyFlow(),
            gaps = tracker.gapDetected.map { },
            scope = backgroundScope,
        )
        coordinator.attach()
        testScheduler.runCurrent()
        tracker.observe(5L)
        tracker.observe(6L)
        testScheduler.runCurrent()
        assertThat(calls).isEqualTo(0)
        tracker.observe(9L)
        testScheduler.runCurrent()
        assertThat(calls).isEqualTo(1)
        coordinator.detach()
    }
}
