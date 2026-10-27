package me.meeshy.app.widget

import android.content.res.Configuration
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class WidgetRepaintPolicyTest {

    @Test
    fun `a burst of cache writes repaints once, after the burst`() = runTest {
        val cache = MutableSharedFlow<Int>()
        val requests = MutableSharedFlow<Unit>()

        WidgetRepaintPolicy.triggers(cache, requests, burstWindowMillis = 400).test {
            cache.emit(1)
            advanceTimeBy(100)
            cache.emit(2)
            advanceTimeBy(100)
            cache.emit(3)
            expectNoEvents()
            advanceTimeBy(500)
            assertThat(awaitItem()).isEqualTo(Unit)
            expectNoEvents()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `an explicit request repaints without any cache change`() = runTest {
        val requests = MutableSharedFlow<Unit>()

        WidgetRepaintPolicy.triggers(flowOf(), requests, burstWindowMillis = 400).test {
            requests.emit(Unit)
            advanceTimeBy(500)
            assertThat(awaitItem()).isEqualTo(Unit)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `switching the system to night mode is a change, staying in it is not`() {
        val change = NightModeChange(initialUiMode = Configuration.UI_MODE_NIGHT_NO)

        assertThat(change.observe(Configuration.UI_MODE_NIGHT_NO)).isFalse()
        assertThat(change.observe(Configuration.UI_MODE_NIGHT_YES)).isTrue()
        assertThat(change.observe(Configuration.UI_MODE_NIGHT_YES or Configuration.UI_MODE_TYPE_NORMAL)).isFalse()
        assertThat(change.observe(Configuration.UI_MODE_NIGHT_NO)).isTrue()
    }
}
