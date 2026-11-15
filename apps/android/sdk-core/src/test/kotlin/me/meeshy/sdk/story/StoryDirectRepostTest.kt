package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.story.StoryRepostDestination
import me.meeshy.sdk.model.story.StoryRepostFailure
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.RepostPayload
import org.junit.Test

/** Republier d'un tap (#15067, iOS `StoryDirectRepost` + `RepostPublisher`) : jeton, file hors ligne, verrou par cible, refus nommés. */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryDirectRepostTest {

    private class Rig(var answer: suspend () -> NetworkResult<ApiPost>, var unsent: Boolean = false) {
        val sent = mutableListOf<Triple<String, String, String>>()
        val adopted = mutableListOf<ApiPost>()
        val queued = mutableListOf<OutboxMutation>()
        var wakes = 0
        private var next = 0

        val sut = StoryDirectRepost(
            send = { id, type, cmid -> sent += Triple(id, type, cmid); answer() },
            adoptStory = { adopted += it },
            hasUnsentRow = { unsent },
            enqueue = { queued += it },
            schedule = { wakes++ },
            newCmid = { "cmid_${++next}" },
        )
    }

    private fun ok(type: String = "STORY") = NetworkResult.Success(ApiPost(id = "rp1", type = type))

    private fun refused(status: Int?) = NetworkResult.Failure(ApiError(message = "no", httpStatus = status))

    @Test
    fun `a tap republishes once, under the destination's type and an idempotency token`() = runTest {
        val rig = Rig({ ok("REEL") })

        val outcome = rig.sut.publish("s1", StoryRepostDestination.REEL)

        assertThat(outcome).isEqualTo(StoryDirectRepostOutcome.Published)
        assertThat(rig.sent).containsExactly(Triple("s1", "REEL", "cmid_1"))
        assertThat(rig.queued).isEmpty()
    }

    @Test
    fun `a story republished as a story joins the tray, a post or a reel does not`() = runTest {
        val story = Rig({ ok("STORY") })
        story.sut.publish("s1", StoryRepostDestination.STORY)
        assertThat(story.adopted).hasSize(1)

        val post = Rig({ ok("POST") })
        post.sut.publish("s1", StoryRepostDestination.POST)
        assertThat(post.adopted).isEmpty()
    }

    @Test
    fun `404 and 403 are named, anything else is generic, and none is queued`() = runTest {
        val cases = mapOf(
            404 to StoryRepostFailure.SOURCE_GONE,
            403 to StoryRepostFailure.AUDIENCE_WIDENING,
            500 to StoryRepostFailure.OTHER,
        )
        cases.forEach { (status, failure) ->
            val rig = Rig({ refused(status) })
            assertThat(rig.sut.publish("s1", StoryRepostDestination.STORY)).isEqualTo(StoryDirectRepostOutcome.Refused(failure))
            assertThat(rig.queued).isEmpty()
        }
    }

    @Test
    fun `offline the republication is queued under the SAME token and wakes the flusher`() = runTest {
        val rig = Rig({ refused(null) })

        val outcome = rig.sut.publish("s1", StoryRepostDestination.POST)

        assertThat(outcome).isEqualTo(StoryDirectRepostOutcome.Queued)
        val row = rig.queued.single()
        assertThat(row.kind).isEqualTo(OutboxKind.REPOST_POST)
        assertThat(row.lane).isEqualTo(OutboxLanes.SOCIAL)
        assertThat(row.targetId).isEqualTo("s1")
        assertThat(row.cmid).isEqualTo(rig.sent.single().third)
        assertThat(MeeshyApi.json.decodeFromString(RepostPayload.serializer(), row.payload).targetType).isEqualTo("POST")
        assertThat(rig.wakes).isEqualTo(1)
    }

    @Test
    fun `a republication already waiting in the queue swallows the second tap`() = runTest {
        val rig = Rig({ ok() }, unsent = true)

        assertThat(rig.sut.publish("s1", StoryRepostDestination.STORY)).isEqualTo(StoryDirectRepostOutcome.Duplicate)
        assertThat(rig.sent).isEmpty()
    }

    @Test
    fun `two quick taps on the same story send one request`() = runTest(UnconfinedTestDispatcher()) {
        val gate = CompletableDeferred<NetworkResult<ApiPost>>()
        val rig = Rig({ gate.await() })

        val first = async { rig.sut.publish("s1", StoryRepostDestination.STORY) }
        val second = rig.sut.publish("s1", StoryRepostDestination.STORY)
        gate.complete(ok())

        assertThat(second).isEqualTo(StoryDirectRepostOutcome.Duplicate)
        assertThat(first.await()).isEqualTo(StoryDirectRepostOutcome.Published)
        assertThat(rig.sent).hasSize(1)
    }

    @Test
    fun `the lock is released once the answer came, another gesture republishes again`() = runTest {
        val rig = Rig({ ok() })

        rig.sut.publish("s1", StoryRepostDestination.STORY)
        val again = rig.sut.publish("s1", StoryRepostDestination.STORY)

        assertThat(again).isEqualTo(StoryDirectRepostOutcome.Published)
        assertThat(rig.sent.map { it.third }).containsExactly("cmid_1", "cmid_2").inOrder()
    }
}
