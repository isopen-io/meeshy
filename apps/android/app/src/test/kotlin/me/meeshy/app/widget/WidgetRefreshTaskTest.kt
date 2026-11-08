package me.meeshy.app.widget

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class WidgetRefreshTaskTest {

    @Test
    fun `a burst of changes repaints once, under a second after the last one`() = runTest {
        val cache = MutableSharedFlow<Int>()

        WidgetRepaintPolicy.triggers(cache, flowOf()).test {
            cache.emit(1)
            advanceTimeBy(100)
            cache.emit(2)
            advanceTimeBy(100)
            cache.emit(3)
            expectNoEvents()
            advanceTimeBy(WidgetRepaintPolicy.BURST_WINDOW_MILLIS + 1)
            assertThat(awaitItem()).isEqualTo(Unit)
            expectNoEvents()
            cancelAndIgnoreRemainingEvents()
        }
        assertThat(WidgetRepaintPolicy.BURST_WINDOW_MILLIS).isAtMost(250)
    }

    @Test
    fun `with a session the widgets are repainted from the cache`() = runTest {
        var repaints = 0

        val outcome = WidgetRefreshTask(currentUserId = { "u1" }, repaintAll = { repaints++ }).run()

        assertThat(outcome).isEqualTo(WidgetRefreshOutcome.REFRESHED)
        assertThat(repaints).isEqualTo(1)
    }

    @Test
    fun `without a session the widgets are repainted into the signed out state`() = runTest {
        var repaints = 0

        val outcome = WidgetRefreshTask(currentUserId = { null }, repaintAll = { repaints++ }).run()

        assertThat(outcome).isEqualTo(WidgetRefreshOutcome.SIGNED_OUT)
        assertThat(repaints).isEqualTo(1)
    }

    @Test
    fun `a signed out unread widget never shows the previous account total`() {
        assertThat(UnreadWidgetPresentation.signedOut().hasUnread).isFalse()
        assertThat(UnreadWidgetPresentation.signedOut().count).isEqualTo(0)
    }
}
