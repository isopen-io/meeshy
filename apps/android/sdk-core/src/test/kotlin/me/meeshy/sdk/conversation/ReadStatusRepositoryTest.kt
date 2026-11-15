package me.meeshy.sdk.conversation

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ReadByUser
import me.meeshy.sdk.model.ReadStatusData
import me.meeshy.sdk.model.ReadStatusUpdatedEvent
import me.meeshy.sdk.net.api.MessageApi
import org.junit.Test
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class ReadStatusRepositoryTest {

    private class Clock(var now: Long = 1_000L) : CacheClock {
        override fun nowMillis() = now
    }

    private class Fixture(val api: MessageApi = mockk(), val clock: Clock = Clock()) {
        val events = MutableSharedFlow<ReadStatusUpdatedEvent>(extraBufferCapacity = 8)
        val sut = ReadStatusRepository(api, { events }, clock, freshForMillis = 30_000L)
    }

    private fun data(readers: Int = 1) = ReadStatusData(
        messageId = "m1", totalMembers = 3, receivedCount = 2, readCount = readers,
        readBy = List(readers) { ReadByUser("p$it", "P$it") },
    )

    private fun ok(d: ReadStatusData) = ApiResponse(success = true, data = d)

    private fun event(conv: String = "c1") = ReadStatusUpdatedEvent(conversationId = conv, participantId = "p9")

    @Test
    fun `cold start shows the spinner then the data`() = runTest(UnconfinedTestDispatcher()) {
        val f = Fixture()
        val gate = CompletableDeferred<Unit>()
        coEvery { f.api.readStatus("m1") } coAnswers { gate.await(); ok(data()) }

        f.sut.observe("m1", "c1").test {
            awaitItem()
            val loading = awaitItem()
            assertThat(loading.showsSpinner).isTrue()
            gate.complete(Unit)
            val loaded = expectMostRecentItem()
            assertThat(loaded.data).isEqualTo(data())
            assertThat(loaded.showsSpinner).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `warm and fresh cache is served without a request`() = runTest(UnconfinedTestDispatcher()) {
        val f = Fixture()
        coEvery { f.api.readStatus("m1") } returns ok(data())
        f.sut.observe("m1", "c1").test { expectMostRecentItem(); cancelAndIgnoreRemainingEvents() }

        f.clock.now += 5_000
        f.sut.observe("m1", "c1").test {
            assertThat(awaitItem().data).isEqualTo(data())
            cancelAndIgnoreRemainingEvents()
        }
        coVerify(exactly = 1) { f.api.readStatus("m1") }
    }

    @Test
    fun `stale cache is served at once and revalidated without a spinner`() = runTest(UnconfinedTestDispatcher()) {
        val f = Fixture()
        coEvery { f.api.readStatus("m1") } returns ok(data(1))
        f.sut.observe("m1", "c1").test { expectMostRecentItem(); cancelAndIgnoreRemainingEvents() }

        f.clock.now += 60_000
        coEvery { f.api.readStatus("m1") } returns ok(data(2))
        f.sut.observe("m1", "c1").test {
            val first = awaitItem()
            assertThat(first.data).isEqualTo(data(1))
            assertThat(first.showsSpinner).isFalse()
            val last = expectMostRecentItem()
            assertThat(last.data).isEqualTo(data(2))
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a live event forces a reload and never blanks the data`() = runTest(UnconfinedTestDispatcher()) {
        val f = Fixture()
        coEvery { f.api.readStatus("m1") } returns ok(data(1))
        f.sut.observe("m1", "c1").test {
            expectMostRecentItem()
            coEvery { f.api.readStatus("m1") } returns ok(data(2))
            f.events.emit(event())
            val states = mutableListOf(expectMostRecentItem())
            assertThat(states.last().data).isEqualTo(data(2))
            assertThat(states.last().showsSpinner).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
        coVerify(exactly = 2) { f.api.readStatus("m1") }
    }

    @Test
    fun `an event from another conversation is ignored`() = runTest(UnconfinedTestDispatcher()) {
        val f = Fixture()
        coEvery { f.api.readStatus("m1") } returns ok(data())
        f.sut.observe("m1", "c1").test {
            expectMostRecentItem()
            f.events.emit(event("other"))
            cancelAndIgnoreRemainingEvents()
        }
        coVerify(exactly = 1) { f.api.readStatus("m1") }
    }

    @Test
    fun `an error keeps the existing data and flags a quiet failure`() = runTest(UnconfinedTestDispatcher()) {
        val f = Fixture()
        coEvery { f.api.readStatus("m1") } returns ok(data())
        f.sut.observe("m1", "c1").test {
            expectMostRecentItem()
            coEvery { f.api.readStatus("m1") } throws IOException("offline")
            f.events.emit(event())
            val s = expectMostRecentItem()
            assertThat(s.data).isEqualTo(data())
            assertThat(s.failure).isEqualTo(ReadStatusLoadFailure.Connection)
            assertThat(s.showsError).isFalse()
            assertThat(s.hasStaleError).isTrue()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a cold server error exposes the error and retry recovers`() = runTest(UnconfinedTestDispatcher()) {
        val f = Fixture()
        coEvery { f.api.readStatus("m1") } returns ApiResponse(success = false, error = "boom")
        f.sut.observe("m1", "c1").test {
            val failed = expectMostRecentItem()
            assertThat(failed.showsError).isTrue()
            assertThat(failed.failure).isEqualTo(ReadStatusLoadFailure.Server)
            coEvery { f.api.readStatus("m1") } returns ok(data())
            f.sut.retry("m1")
            assertThat(expectMostRecentItem().data).isEqualTo(data())
            cancelAndIgnoreRemainingEvents()
        }
    }
}
