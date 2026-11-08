package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import me.meeshy.core.database.entity.OutboxEntity
import org.junit.Test

private fun categoryRow(cmid: String, category: String, payload: String = "{}") = OutboxEntity(
    cmid = cmid,
    lane = OutboxLanes.SETTINGS,
    kind = OutboxKind.UPDATE_PREFERENCE_CATEGORY.name,
    targetId = category,
    payload = payload,
    dependsOn = null,
    attempts = 0,
    state = "PENDING",
    createdAt = 0L,
    updatedAt = 0L,
)

class OutboxCoalescerPreferenceTest {

    @Test
    fun `two writes of the same category make a single row`() {
        val first = categoryRow("a1", "video", """{"mirrorLocalVideo":true}""")
        val second = categoryRow("a2", "video", """{"mirrorLocalVideo":false}""")

        val decision = OutboxCoalescer.decide(second, listOf(first))

        assertThat(decision).isEqualTo(CoalesceDecision.Replace(listOf("a1"), second))
    }

    @Test
    fun `two different categories never supersede one another`() {
        val video = categoryRow("a1", "video")
        val document = categoryRow("a2", "document")

        val decision = OutboxCoalescer.decide(document, listOf(video))

        assertThat(decision).isEqualTo(CoalesceDecision.Enqueue(document))
    }

    @Test
    fun `the category sits on the settings lane`() {
        assertThat(OutboxLaneMap.assignmentFor(OutboxKind.UPDATE_PREFERENCE_CATEGORY))
            .isEqualTo(OutboxLaneAssignment.Shared(OutboxLanes.SETTINGS))
    }
}
