package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

/**
 * Groups a feed surface's post impressions into small batches (feature-parity §F) — port of
 * iOS `ImpressionBatcher`'s debounce/flush/retry core.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ImpressionBatcherTest {

    private fun harness(
        dispatcher: TestDispatcher,
        flushDelayMillis: Long = 3_000L,
    ): Pair<ImpressionBatcher, PostRepository> {
        val repository = mockk<PostRepository>(relaxed = true)
        coEvery { repository.recordImpressions(any(), any()) } returns NetworkResult.Success(Unit)
        val batcher = ImpressionBatcher(
            source = "feed",
            postRepository = repository,
            scope = TestScope(dispatcher),
            flushDelayMillis = flushDelayMillis,
        )
        return batcher to repository
    }

    @Test
    fun record_schedulesAFlushAfterTheDebounceDelay() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val (batcher, repository) = harness(dispatcher)

        batcher.record("p1")
        advanceTimeBy(3_001)

        coVerify(exactly = 1) { repository.recordImpressions(listOf("p1"), "feed") }
    }

    @Test
    fun record_doesNotFlushBeforeTheDelayElapses() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val (batcher, repository) = harness(dispatcher)

        batcher.record("p1")
        advanceTimeBy(2_000)

        coVerify(exactly = 0) { repository.recordImpressions(any(), any()) }
    }

    @Test
    fun record_groupsRecordsWithinTheWindowIntoOneBatch() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val (batcher, repository) = harness(dispatcher)

        batcher.record("p1")
        advanceTimeBy(1_000)
        batcher.record("p2") // resets the 3s window from here
        advanceTimeBy(2_000)
        coVerify(exactly = 0) { repository.recordImpressions(any(), any()) }
        advanceTimeBy(1_001)

        coVerify(exactly = 1) { repository.recordImpressions(listOf("p1", "p2"), "feed") }
    }

    @Test
    fun record_countsARepeatAppearanceAgainRatherThanDeduping() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val (batcher, repository) = harness(dispatcher)

        batcher.record("p1")
        batcher.record("p1")
        advanceTimeBy(3_001)

        coVerify(exactly = 1) { repository.recordImpressions(listOf("p1", "p1"), "feed") }
    }

    @Test
    fun record_withABlankIdIsANoOp() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val (batcher, repository) = harness(dispatcher)

        batcher.record("")
        advanceTimeBy(3_001)

        coVerify(exactly = 0) { repository.recordImpressions(any(), any()) }
    }

    @Test
    fun flushNow_sendsImmediatelyAndCancelsTheScheduledFlush() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val (batcher, repository) = harness(dispatcher)

        batcher.record("p1")
        batcher.flushNow()

        coVerify(exactly = 1) { repository.recordImpressions(listOf("p1"), "feed") }

        advanceTimeBy(3_001)
        coVerify(exactly = 1) { repository.recordImpressions(any(), any()) }
    }

    @Test
    fun flushNowAsync_sendsWithoutBeingAwaited() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val (batcher, repository) = harness(dispatcher)

        batcher.record("p1")
        batcher.flushNowAsync()
        advanceUntilIdle()

        coVerify(exactly = 1) { repository.recordImpressions(listOf("p1"), "feed") }
    }

    @Test
    fun flushNow_onAnEmptyBatchDoesNothing() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val (batcher, repository) = harness(dispatcher)

        batcher.flushNow()

        coVerify(exactly = 0) { repository.recordImpressions(any(), any()) }
    }

    @Test
    fun aFailedFlushKeepsTheBatchPendingForRetry() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repository = mockk<PostRepository>(relaxed = true)
        coEvery { repository.recordImpressions(any(), any()) } returns
            NetworkResult.Failure(ApiError("offline"))
        val batcher = ImpressionBatcher(
            source = "feed",
            postRepository = repository,
            scope = TestScope(dispatcher),
        )

        batcher.record("p1")
        advanceTimeBy(3_001)
        coVerify(exactly = 1) { repository.recordImpressions(listOf("p1"), "feed") }

        coEvery { repository.recordImpressions(any(), any()) } returns NetworkResult.Success(Unit)
        batcher.record("p2")
        advanceTimeBy(3_001)

        coVerify(exactly = 1) { repository.recordImpressions(listOf("p1", "p2"), "feed") }
    }
}
