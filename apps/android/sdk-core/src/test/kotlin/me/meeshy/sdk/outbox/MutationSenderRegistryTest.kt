package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import me.meeshy.core.database.entity.OutboxEntity
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class MutationSenderRegistryTest {

    private class RecordingHandler(
        private val result: SendResult = SendResult.Success,
        override val payloadGraft: OutboxPayloadGraft? = null,
    ) : OutboxKindHandler {
        val sent = mutableListOf<OutboxEntity>()
        val exhausted = mutableListOf<OutboxEntity>()

        override suspend fun send(row: OutboxEntity): SendResult {
            sent += row
            return result
        }

        override suspend fun onExhausted(row: OutboxEntity) {
            exhausted += row
        }
    }

    private fun mutation(
        kind: OutboxKind,
        lane: String,
        targetId: String,
        cmid: String = "$kind-$targetId",
        dependsOn: Set<String> = emptySet(),
        payload: String = "{}",
    ) = OutboxMutation(kind, lane, targetId, payload, dependsOn, cmid)

    @Test
    fun `registered kinds are exactly the kinds that have a handler`() {
        val registry = MutationSenderRegistry(
            mapOf(OutboxKind.SEND_MESSAGE to RecordingHandler(), OutboxKind.LIKE_POST to RecordingHandler()),
        )

        assertThat(registry.registeredKinds).containsExactly(OutboxKind.SEND_MESSAGE, OutboxKind.LIKE_POST)
    }

    @Test
    fun `the shared lanes to sweep come from the kind to lane map, not from the registered handlers`() {
        val registry = MutationSenderRegistry(emptyMap())

        assertThat(registry.sharedLanes).containsExactlyElementsIn(OutboxLaneMap.sharedDrainLanes).inOrder()
    }

    @Test
    fun `drainAll delivers the per conversation message lanes and every shared lane`() = withOutbox { outbox ->
        val message = RecordingHandler()
        val reaction = RecordingHandler()
        val block = RecordingHandler()
        val social = RecordingHandler()
        val registry = MutationSenderRegistry(
            mapOf(
                OutboxKind.SEND_MESSAGE to message,
                OutboxKind.ADD_REACTION to reaction,
                OutboxKind.BLOCK_USER to block,
                OutboxKind.LIKE_POST to social,
            ),
        )
        outbox.enqueue(mutation(OutboxKind.SEND_MESSAGE, OutboxLanes.forMessage("c1"), "m1"))
        outbox.enqueue(mutation(OutboxKind.SEND_MESSAGE, OutboxLanes.forMessage("c2"), "m2"))
        outbox.enqueue(mutation(OutboxKind.ADD_REACTION, OutboxLanes.REACTION, "m1"))
        outbox.enqueue(mutation(OutboxKind.BLOCK_USER, OutboxLanes.BLOCK, "u1"))
        outbox.enqueue(mutation(OutboxKind.LIKE_POST, OutboxLanes.SOCIAL, "p1"))

        val reports = registry.drainAll(outbox)

        assertThat(message.sent.map { it.targetId }).containsExactly("m1", "m2")
        assertThat(reaction.sent).hasSize(1)
        assertThat(block.sent).hasSize(1)
        assertThat(social.sent).hasSize(1)
        assertThat(reports.sumOf { it.delivered }).isEqualTo(5)
        assertThat(reports).hasSize(2 + OutboxLaneMap.sharedDrainLanes.size)
        assertThat(outbox.observeAll().first()).isEmpty()
    }

    @Test
    fun `a row of a kind nobody registered is exhausted instead of being left queued forever`() = withOutbox { outbox ->
        val registry = MutationSenderRegistry(emptyMap())
        outbox.enqueue(mutation(OutboxKind.BLOCK_USER, OutboxLanes.BLOCK, "u1", cmid = "b1"))

        val reports = registry.drainAll(outbox)

        assertThat(reports.sumOf { it.exhausted }).isEqualTo(1)
        assertThat(outbox.stateOf("b1")).isEqualTo(OutboxState.EXHAUSTED)
    }

    @Test
    fun `a permanent failure exhausts the row and rolls back through its own kind handler only`() = withOutbox { outbox ->
        val reaction = RecordingHandler(result = SendResult.PermanentFailure("nope"))
        val block = RecordingHandler()
        val registry = MutationSenderRegistry(
            mapOf(OutboxKind.ADD_REACTION to reaction, OutboxKind.BLOCK_USER to block),
        )
        outbox.enqueue(mutation(OutboxKind.ADD_REACTION, OutboxLanes.REACTION, "m1", cmid = "r1"))
        outbox.enqueue(mutation(OutboxKind.BLOCK_USER, OutboxLanes.BLOCK, "u1", cmid = "b1"))

        registry.drainAll(outbox)

        assertThat(outbox.stateOf("r1")).isEqualTo(OutboxState.EXHAUSTED)
        assertThat(reaction.exhausted.map { it.cmid }).containsExactly("r1")
        assertThat(block.exhausted).isEmpty()
        assertThat(outbox.stateOf("b1")).isNull()
    }

    @Test
    fun `a transient failure stops its own lane without blocking the others`() = withOutbox { outbox ->
        val block = RecordingHandler(result = SendResult.TransientFailure)
        val social = RecordingHandler()
        val registry = MutationSenderRegistry(
            mapOf(OutboxKind.BLOCK_USER to block, OutboxKind.LIKE_POST to social),
        )
        outbox.enqueue(mutation(OutboxKind.BLOCK_USER, OutboxLanes.BLOCK, "u1", cmid = "b1"))
        outbox.enqueue(mutation(OutboxKind.LIKE_POST, OutboxLanes.SOCIAL, "p1", cmid = "l1"))

        val reports = registry.drainAll(outbox)

        assertThat(social.sent).hasSize(1)
        assertThat(outbox.stateOf("l1")).isNull()
        assertThat(outbox.stateOf("b1")).isEqualTo(OutboxState.PENDING)
        assertThat(OutboxFlushPlan.outcome(reports)).isEqualTo(FlushOutcome.RETRY)
    }

    @Test
    fun `a delivered upload id is grafted through the write back a handler declares`() = withOutbox { outbox ->
        val upload = RecordingHandler(result = SendResult.SuccessWithId("media-1"))
        val message = RecordingHandler(
            payloadGraft = { payload, placeholder, realId -> payload.replace(placeholder, realId) },
        )
        val registry = MutationSenderRegistry(
            mapOf(OutboxKind.UPLOAD_MEDIA to upload, OutboxKind.SEND_MESSAGE to message),
        )
        outbox.enqueue(mutation(OutboxKind.UPLOAD_MEDIA, OutboxLanes.MEDIA, "up", cmid = "up-1"))
        outbox.enqueue(
            mutation(
                OutboxKind.SEND_MESSAGE,
                OutboxLanes.forMessage("c1"),
                "m1",
                cmid = "m-1",
                dependsOn = setOf("up-1"),
                payload = """{"attachmentIds":["up-1"]}""",
            ),
        )

        val firstPass = registry.drainAll(outbox)
        val secondPass = registry.drainAll(outbox)

        assertThat(firstPass.any { it.stoppedOnBlockedDependency }).isTrue()
        assertThat(secondPass.sumOf { it.delivered }).isEqualTo(1)
        assertThat(message.sent.single().payload).isEqualTo("""{"attachmentIds":["media-1"]}""")
    }
}
