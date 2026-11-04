package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.net.MeeshyApi
import org.junit.Test

private fun socialRow(cmid: String, kind: OutboxKind, target: String, payload: String = "{}") = OutboxEntity(
    cmid = cmid,
    lane = "lane",
    kind = kind.name,
    targetId = target,
    payload = payload,
    dependsOn = null,
    attempts = 0,
    state = "PENDING",
    createdAt = 0L,
    updatedAt = 0L,
)

private fun like(cmid: String, comment: String, liked: Boolean) = socialRow(
    cmid,
    OutboxKind.TOGGLE_LIKE_COMMENT,
    comment,
    MeeshyApi.json.encodeToString(ToggleLikeCommentPayload.serializer(), ToggleLikeCommentPayload("p1", liked)),
)

class OutboxCoalescerSocialTest {

    @Test
    fun `a heart then its opposite on the same comment cancel each other before any request`() {
        val decision = OutboxCoalescer.decide(like("u", "c1", liked = false), listOf(like("l", "c1", liked = true)))

        assertThat(decision).isEqualTo(CoalesceDecision.Annihilate(listOf("l")))
    }

    @Test
    fun `the same heart twice keeps the latest and hearts of other comments are left alone`() {
        val again = like("l2", "c1", liked = true)

        assertThat(OutboxCoalescer.decide(again, listOf(like("l1", "c1", liked = true))))
            .isEqualTo(CoalesceDecision.Replace(listOf("l1"), again))
        assertThat(OutboxCoalescer.decide(again, listOf(like("l0", "c2", liked = false))))
            .isEqualTo(CoalesceDecision.Enqueue(again))
    }

    @Test
    fun `ten views of the same story are one row, other stories keep theirs`() {
        val pending = (1..9).map { socialRow("v$it", OutboxKind.MARK_STORY_VIEWED, "s1") }
        val tenth = socialRow("v10", OutboxKind.MARK_STORY_VIEWED, "s1")

        val decision = OutboxCoalescer.decide(tenth, pending + socialRow("other", OutboxKind.MARK_STORY_VIEWED, "s2"))

        assertThat(decision).isEqualTo(CoalesceDecision.Replace(pending.map { it.cmid }, tenth))
    }

    @Test
    fun `deleting a comment takes its queued hearts with it`() {
        val delete = socialRow("d", OutboxKind.DELETE_COMMENT, "c1")

        val decision = OutboxCoalescer.decide(delete, listOf(like("l", "c1", liked = true), like("x", "c2", liked = true)))

        assertThat(decision).isEqualTo(CoalesceDecision.Replace(listOf("l"), delete))
    }

    @Test
    fun `story views never keep the synchronisation indicator on, the other social kinds do`() {
        assertThat(OutboxKindCatalog.metaFor(OutboxKind.MARK_STORY_VIEWED).countsForSyncIndicator).isFalse()
        listOf(OutboxKind.DELETE_COMMENT, OutboxKind.TOGGLE_LIKE_COMMENT, OutboxKind.REPOST_STORY, OutboxKind.REPOST_POST)
            .forEach { assertThat(OutboxKindCatalog.metaFor(it).countsForSyncIndicator).isTrue() }
    }

    @Test
    fun `every new kind drains on a lane the worker sweeps`() {
        listOf(OutboxKind.REPOST_STORY, OutboxKind.MARK_STORY_VIEWED, OutboxKind.DELETE_COMMENT, OutboxKind.TOGGLE_LIKE_COMMENT).forEach {
            val lane = (OutboxLaneMap.assignmentFor(it) as OutboxLaneAssignment.Shared).lane
            assertThat(OutboxLaneMap.sharedDrainLanes).contains(lane)
        }
    }
}
