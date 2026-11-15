package me.meeshy.sdk.outbox

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ongoing.OutboxActivityItem
import me.meeshy.sdk.model.ongoing.OutboxActivityKind
import me.meeshy.sdk.model.ongoing.OutboxActivityLaw
import me.meeshy.sdk.model.ongoing.OutboxActivityPhase
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class OutboxProgressObserverTest {

    private val wording = OutboxActivityLaw.Wording("story", "media", "message", "sent", "failed")
    private fun upload(id: String, terminal: Boolean = false) = OutboxActivityItem(id, OutboxActivityKind.Media, terminal)
    private fun text(id: String) = OutboxActivityItem(id, OutboxActivityKind.Text, false)

    private class Fixture {
        val items = MutableStateFlow<List<OutboxActivityItem>>(emptyList())
        val offline = MutableStateFlow(false)
    }

    private fun Fixture.steps() = OutboxProgressObserver.steps(items, offline, { wording })

    @Test
    fun `a short text send never raises a step action`() = runTest {
        val f = Fixture()
        f.steps().test {
            f.items.value = listOf(text("t"))
            advanceTimeBy(2_000)
            expectNoEvents()
        }
    }

    @Test
    fun `a long upload starts then concludes as sent`() = runTest {
        val f = Fixture()
        f.steps().test {
            f.items.value = listOf(upload("a"))
            assertThat((awaitItem().action as OutboxActivityLaw.Action.Start).snapshot.phase).isEqualTo(OutboxActivityPhase.Sending)
            f.items.value = emptyList()
            assertThat((awaitItem().action as OutboxActivityLaw.Action.End).snapshot.phase).isEqualTo(OutboxActivityPhase.Sent)
        }
    }

    @Test
    fun `losing the network moves the running send to waiting for the network`() = runTest {
        val f = Fixture()
        f.steps().test {
            f.items.value = listOf(upload("a"))
            awaitItem()
            f.offline.value = true
            val update = awaitItem().action as OutboxActivityLaw.Action.Update
            assertThat(update.snapshot.phase).isEqualTo(OutboxActivityPhase.WaitingForNetwork)
        }
    }

    @Test
    fun `a burst of queue changes is spaced by the minimum interval`() = runTest {
        val f = Fixture()
        f.steps().test {
            f.items.value = listOf(upload("a"))
            awaitItem()
            f.items.value = listOf(upload("a"), upload("b"))
            runCurrent()
            expectNoEvents()
            advanceTimeBy(OutboxProgressObserver.MIN_INTERVAL_MS + 100)
            assertThat(awaitItem().action).isInstanceOf(OutboxActivityLaw.Action.Update::class.java)
        }
    }
}
