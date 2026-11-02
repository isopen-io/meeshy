package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.analytics.ContentSurface
import me.meeshy.sdk.model.analytics.ImpressionSource
import me.meeshy.sdk.model.analytics.SocialEvent
import me.meeshy.sdk.model.analytics.StampedSocialEvent
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

/**
 * Groupe les impressions d'une surface et les envoie par `POST /social/events` (#12483) — port du
 * `ImpressionBatcher` iOS : chaque apparition porte son enveloppe dès son `record`, un refus
 * définitif n'est jamais rejoué, et un échec transitoire rejoue les MÊMES identifiants, sans doublon.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ImpressionBatcherTest {

    private class Delivery(var answer: (List<StampedSocialEvent>) -> NetworkResult<Unit> = { NetworkResult.Success(Unit) }) {
        val batches = mutableListOf<List<StampedSocialEvent>>()
        val send: suspend (List<StampedSocialEvent>) -> NetworkResult<Unit> = { events ->
            batches += events
            answer(events)
        }
        val postIds: List<List<String>> get() = batches.map { batch -> batch.map { it.postId } }
        val eventIds: List<List<String>> get() = batches.map { batch -> batch.map { it.stamp.eventId } }
    }

    private fun refused(status: Int?, code: String? = null) =
        NetworkResult.Failure(ApiError(message = "refused", code = code, httpStatus = status))

    private fun TestScope.batcher(
        delivery: Delivery,
        source: ImpressionSource = ImpressionSource.FEED,
        surface: ContentSurface? = ContentSurface.FEED,
    ) = ImpressionBatcher(
        source = source,
        surface = surface,
        deliver = delivery.send,
        scope = TestScope(StandardTestDispatcher(testScheduler)),
        nowMillis = { 1_757_928_864_000L },
    )

    @Test
    fun record_schedulesAFlushAfterTheDebounceDelay() = runTest {
        val delivery = Delivery()
        val batcher = batcher(delivery)

        batcher.record("p1")
        advanceTimeBy(2_000)
        assertThat(delivery.batches).isEmpty()
        advanceTimeBy(1_001)

        assertThat(delivery.postIds).containsExactly(listOf("p1"))
    }

    @Test
    fun record_groupsRecordsWithinTheWindowIntoOneBatch() = runTest {
        val delivery = Delivery()
        val batcher = batcher(delivery)

        batcher.record("p1")
        advanceTimeBy(1_000)
        batcher.record("p2")
        advanceTimeBy(2_000)
        assertThat(delivery.batches).isEmpty()
        advanceTimeBy(1_001)

        assertThat(delivery.postIds).containsExactly(listOf("p1", "p2"))
    }

    @Test
    fun record_countsARepeatAppearanceAgainUnderItsOwnEventId() = runTest {
        val delivery = Delivery()
        val batcher = batcher(delivery)

        batcher.record("p1")
        batcher.record("p1")
        advanceTimeBy(3_001)

        assertThat(delivery.postIds).containsExactly(listOf("p1", "p1"))
        assertThat(delivery.eventIds.single().toSet()).hasSize(2)
    }

    @Test
    fun record_withABlankIdIsANoOp() = runTest {
        val delivery = Delivery()
        val batcher = batcher(delivery)

        batcher.record("")
        advanceTimeBy(3_001)

        assertThat(delivery.batches).isEmpty()
    }

    @Test
    fun theStoryRailSendsTheSourceAndSurfaceIosSends() = runTest {
        val delivery = Delivery()
        val batcher = batcher(delivery, ImpressionSource.STORY, ContentSurface.STORY_RAIL)

        batcher.record("s1")
        batcher.flushNow()

        val event = delivery.batches.single().single().event as SocialEvent.Impression
        assertThat(event.source).isEqualTo("story")
        assertThat(event.surface).isEqualTo(ContentSurface.STORY_RAIL)
        assertThat(delivery.batches.single().single().stamp.occurredAtMs).isEqualTo(1_757_928_864_000L)
    }

    @Test
    fun flushNow_sendsImmediatelyAndCancelsTheScheduledFlush() = runTest {
        val delivery = Delivery()
        val batcher = batcher(delivery)

        batcher.record("p1")
        batcher.flushNow()
        advanceTimeBy(3_001)

        assertThat(delivery.postIds).containsExactly(listOf("p1"))
    }

    @Test
    fun flushNowAsync_sendsWithoutBeingAwaited() = runTest {
        val delivery = Delivery()
        val batcher = batcher(delivery)

        batcher.record("p1")
        batcher.flushNowAsync()
        advanceUntilIdle()

        assertThat(delivery.postIds).containsExactly(listOf("p1"))
    }

    @Test
    fun flushNow_onAnEmptyBatchDoesNothing() = runTest {
        val delivery = Delivery()
        batcher(delivery).flushNow()

        assertThat(delivery.batches).isEmpty()
    }

    @Test
    fun aTransientFailureReplaysTheSameEventIdsOnceEach() = runTest {
        val delivery = Delivery(answer = { refused(status = null, code = "NETWORK") })
        val batcher = batcher(delivery)

        batcher.record("p1")
        batcher.flushNow()
        batcher.flushNow()
        delivery.answer = { NetworkResult.Success(Unit) }
        batcher.record("p2")
        batcher.flushNow()
        batcher.flushNow()

        val first = delivery.eventIds.first().single()
        assertThat(delivery.postIds).containsExactly(listOf("p1"), listOf("p1"), listOf("p1", "p2")).inOrder()
        assertThat(delivery.eventIds.map { it.first() }.toSet()).containsExactly(first)
        assertThat(delivery.eventIds.last().toSet()).hasSize(2)
    }

    @Test
    fun aDefinitiveRefusalIsNeverQueuedAgain() = runTest {
        val delivery = Delivery(answer = { refused(status = 400, code = "VALIDATION_ERROR") })
        val batcher = batcher(delivery)

        repeat(5) {
            batcher.record("s1")
            batcher.record("s2")
            batcher.flushNow()
        }

        assertThat(delivery.batches.map { it.size }).containsExactly(2, 2, 2, 2, 2)
    }

    @Test
    fun throttlingTimeoutAndSessionExpiryStayReplayable() = runTest {
        listOf(401, 408, 429, 503).forEach { status ->
            val delivery = Delivery(answer = { refused(status) })
            val batcher = batcher(delivery)

            batcher.record("p1")
            batcher.flushNow()
            delivery.answer = { NetworkResult.Success(Unit) }
            batcher.flushNow()

            assertThat(delivery.postIds).containsExactly(listOf("p1"), listOf("p1")).inOrder()
        }
    }

    @Test
    fun anUnreadableSuccessIsNotReplayedSoTheServerNeverCountsTwice() = runTest {
        val delivery = Delivery(answer = { refused(status = null, code = "PARSE") })
        val batcher = batcher(delivery)

        batcher.record("p1")
        batcher.flushNow()
        batcher.flushNow()

        assertThat(delivery.batches).hasSize(1)
    }

    @Test
    fun aLargeBatchLeavesInChunksUnderTheGatewayCap() = runTest {
        val delivery = Delivery()
        val batcher = batcher(delivery)

        repeat(250) { batcher.record("p$it") }
        batcher.flushNow()

        assertThat(delivery.batches.map { it.size }).containsExactly(200, 50).inOrder()
    }

    @Test
    fun theRetryQueueIsBounded() = runTest {
        val delivery = Delivery(answer = { refused(status = 503) })
        val batcher = batcher(delivery)

        repeat(ImpressionBatcher.PENDING_CAP + 20) { batcher.record("p$it") }
        batcher.flushNow()
        delivery.batches.clear()
        delivery.answer = { NetworkResult.Success(Unit) }
        batcher.flushNow()

        assertThat(delivery.batches.sumOf { it.size }).isEqualTo(ImpressionBatcher.PENDING_CAP)
    }
}
