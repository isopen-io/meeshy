package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.StoryReactionPayload
import org.junit.Test

/** Réseau contre refus (iOS `StoryReactionRecovery`) : la panne part en file, le refus se rend, rien ne se rejoue pour rien. */
class StoryReactionDispatchTest {

    private class Rig(var answer: StoryReactionOutcome, var cmid: String? = "cmid_1") {
        val queued = mutableListOf<OutboxMutation>()
        var wakes = 0

        val sut = StoryReactionDispatch(
            send = { _, _ -> answer },
            enqueue = { queued += it; cmid },
            schedule = { wakes++ },
        )
    }

    @Test
    fun `a reaction the server took is delivered and nothing is queued`() = runTest {
        val rig = Rig(StoryReactionOutcome.Applied)

        assertThat(rig.sut.publish("s1", "🔥")).isEqualTo(StoryReactionDelivery.Delivered)
        assertThat(rig.queued).isEmpty()
    }

    @Test
    fun `a transport failure joins the durable queue on the social lane and wakes the flush`() = runTest {
        val rig = Rig(StoryReactionOutcome.TransportFailure("offline"))

        assertThat(rig.sut.publish("s1", "🔥")).isEqualTo(StoryReactionDelivery.Queued)

        val row = rig.queued.single()
        assertThat(row.kind).isEqualTo(OutboxKind.REACT_STORY)
        assertThat(row.lane).isEqualTo(OutboxLanes.SOCIAL)
        assertThat(row.targetId).isEqualTo("s1")
        assertThat(MeeshyApi.json.decodeFromString(StoryReactionPayload.serializer(), row.payload)).isEqualTo(StoryReactionPayload("🔥"))
        assertThat(rig.wakes).isEqualTo(1)
    }

    @Test
    fun `a server refusal is handed back whole and never queued`() = runTest {
        val rig = Rig(StoryReactionOutcome.Refused(409, StoryReactionOutcome.LIMIT_REACHED_CODE, "limit"))

        assertThat(rig.sut.publish("s1", "🔥")).isEqualTo(StoryReactionDelivery.Refused(409, limitReached = true))
        assertThat(rig.queued).isEmpty()
        assertThat(rig.wakes).isEqualTo(0)
    }

    @Test
    fun `a queue that cannot keep the row refuses the reaction`() = runTest {
        val rig = Rig(StoryReactionOutcome.TransportFailure("offline"), cmid = null)

        assertThat(rig.sut.publish("s1", "🔥")).isEqualTo(StoryReactionDelivery.Refused(null, limitReached = false))
        assertThat(rig.wakes).isEqualTo(0)
    }
}
