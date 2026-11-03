package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.model.outbox.OutboxSentinelTargets
import me.meeshy.sdk.net.MeeshyApi
import org.junit.Test

private fun row(
    cmid: String,
    kind: OutboxKind,
    target: String,
    payload: String = "{}",
    lane: String = "lane",
) = OutboxEntity(
    cmid = cmid,
    lane = lane,
    kind = kind.name,
    targetId = target,
    payload = payload,
    dependsOn = null,
    attempts = 0,
    state = "PENDING",
    createdAt = 0L,
    updatedAt = 0L,
)

private fun payloadOf(entity: OutboxEntity): JsonObject = MeeshyApi.json.parseToJsonElement(entity.payload).jsonObject

class OutboxCoalescerKindsTest {

    @Test
    fun `an edit after a queued send is folded into the send which keeps its cmid`() {
        val send = row("cid_1", OutboxKind.SEND_MESSAGE, "conv-1", """{"content":"salut","originalLanguage":"fr","clientMessageId":"cid_1"}""")
        val edit = row("e1", OutboxKind.EDIT_MESSAGE, "cid_1", """{"content":"salut tout le monde"}""")

        val decision = OutboxCoalescer.decide(edit, listOf(send))

        val replace = decision as CoalesceDecision.Replace
        assertThat(replace.supersededCmids).isEmpty()
        assertThat(replace.row.cmid).isEqualTo("cid_1")
        assertThat(replace.row.kind).isEqualTo(OutboxKind.SEND_MESSAGE.name)
        assertThat(payloadOf(replace.row)["content"]).isEqualTo(JsonPrimitive("salut tout le monde"))
        assertThat(payloadOf(replace.row)["originalLanguage"]).isEqualTo(JsonPrimitive("fr"))
    }

    @Test
    fun `an edit of a message with no queued send stays a separate edit`() {
        val edit = row("e1", OutboxKind.EDIT_MESSAGE, "m1", """{"content":"x"}""")

        assertThat(OutboxCoalescer.decide(edit, emptyList())).isEqualTo(CoalesceDecision.Enqueue(edit))
    }

    @Test
    fun `a delete after a queued send annihilates the send by its cmid`() {
        val send = row("cid_1", OutboxKind.SEND_MESSAGE, "conv-1")
        val delete = row("d1", OutboxKind.DELETE_MESSAGE, "cid_1")

        assertThat(OutboxCoalescer.decide(delete, listOf(send)))
            .isEqualTo(CoalesceDecision.Annihilate(listOf("cid_1")))
    }

    @Test
    fun `a delete after an edit replaces the edit`() {
        val edit = row("e1", OutboxKind.EDIT_MESSAGE, "m1")
        val delete = row("d1", OutboxKind.DELETE_MESSAGE, "m1")

        assertThat(OutboxCoalescer.decide(delete, listOf(edit))).isEqualTo(CoalesceDecision.Replace(listOf("e1"), delete))
    }

    @Test
    fun `two conversation detail updates merge field by field with the last winning`() {
        val first = row("u1", OutboxKind.UPDATE_CONVERSATION, "c1", """{"title":"A","description":"d"}""")
        val second = row("u2", OutboxKind.UPDATE_CONVERSATION, "c1", """{"title":"B","avatar":"https://x/a.png"}""")

        val replace = OutboxCoalescer.decide(second, listOf(first)) as CoalesceDecision.Replace

        assertThat(replace.supersededCmids).containsExactly("u1")
        assertThat(replace.row.cmid).isEqualTo("u2")
        val merged = payloadOf(replace.row)
        assertThat(merged["title"]).isEqualTo(JsonPrimitive("B"))
        assertThat(merged["description"]).isEqualTo(JsonPrimitive("d"))
        assertThat(merged["avatar"]).isEqualTo(JsonPrimitive("https://x/a.png"))
    }

    @Test
    fun `updates of two different conversations never merge`() {
        val first = row("u1", OutboxKind.UPDATE_CONVERSATION, "c1", """{"title":"A"}""")
        val other = row("u2", OutboxKind.UPDATE_CONVERSATION, "c2", """{"title":"B"}""")

        assertThat(OutboxCoalescer.decide(other, listOf(first))).isEqualTo(CoalesceDecision.Enqueue(other))
    }

    @Test
    fun `a settings action merges its body with the pending one of the same endpoint and method`() {
        val target = OutboxSentinelTargets.settingsAction("PATCH", "me/preferences/x")
        val first = row("s1", OutboxKind.SETTINGS_ACTION, target, """{"method":"PATCH","endpoint":"me/preferences/x","body":{"a":1,"b":2}}""")
        val second = row("s2", OutboxKind.SETTINGS_ACTION, target, """{"method":"PATCH","endpoint":"me/preferences/x","body":{"b":3}}""")

        val replace = OutboxCoalescer.decide(second, listOf(first)) as CoalesceDecision.Replace

        val body = payloadOf(replace.row)["body"]!!.jsonObject
        assertThat(body["a"]).isEqualTo(JsonPrimitive(1))
        assertThat(body["b"]).isEqualTo(JsonPrimitive(3))
        assertThat(payloadOf(replace.row)["endpoint"]).isEqualTo(JsonPrimitive("me/preferences/x"))
    }

    @Test
    fun `settings actions on different endpoints stay in arrival order`() {
        val a = row("s1", OutboxKind.SETTINGS_ACTION, OutboxSentinelTargets.settingsAction("PATCH", "me/a"))
        val b = row("s2", OutboxKind.SETTINGS_ACTION, OutboxSentinelTargets.settingsAction("PATCH", "me/b"))

        assertThat(OutboxCoalescer.decide(b, listOf(a))).isEqualTo(CoalesceDecision.Enqueue(b))
    }

    @Test
    fun `creating two conversations never coalesces`() {
        val first = row("k1", OutboxKind.CREATE_CONVERSATION, "pending_1")
        val second = row("k2", OutboxKind.CREATE_CONVERSATION, "pending_2")

        assertThat(OutboxCoalescer.decide(second, listOf(first))).isEqualTo(CoalesceDecision.Enqueue(second))
    }

    @Test
    fun `a sentinel target is never held behind a local id`() {
        val action = row("s1", OutboxKind.SETTINGS_ACTION, OutboxSentinelTargets.settingsAction("PUT", "me/x"))

        assertThat(OutboxLocalTargets.isHeld(action)).isFalse()
    }

    @Test
    fun `an update of a still pending conversation is held until its id resolves`() {
        assertThat(OutboxLocalTargets.isHeld(row("u1", OutboxKind.UPDATE_CONVERSATION, "pending_abc"))).isTrue()
        assertThat(OutboxLocalTargets.isHeld(row("k1", OutboxKind.CREATE_CONVERSATION, "pending_abc"))).isFalse()
    }
}

class OutboxCoalescerStoryReactionTest {

    private fun pending(cmid: String, emoji: String, target: String = "s1") =
        row(cmid, OutboxKind.REACT_STORY, target, """{"emoji":"$emoji"}""")

    @Test
    fun `the same emoji queued twice on a story is one write, the latest`() {
        val incoming = pending("r2", "🔥")

        val decision = OutboxCoalescer.decide(incoming, listOf(pending("r1", "🔥")))

        assertThat(decision).isEqualTo(CoalesceDecision.Replace(listOf("r1"), incoming))
    }

    @Test
    fun `another emoji or another story queues its own row`() {
        val incoming = pending("r2", "❤️")

        assertThat(OutboxCoalescer.decide(incoming, listOf(pending("r1", "🔥")))).isEqualTo(CoalesceDecision.Enqueue(incoming))
        assertThat(OutboxCoalescer.decide(pending("r3", "🔥", "s2"), listOf(pending("r1", "🔥"))))
            .isEqualTo(CoalesceDecision.Enqueue(pending("r3", "🔥", "s2")))
    }
}

class OutboxChatKindsCoalescingTest {

    @Test
    fun `restoring a message cancels its queued hiding`() {
        val hide = row("h1", OutboxKind.HIDE_FOR_ME, "m1")
        val restore = row("r1", OutboxKind.RESTORE_FOR_ME, "m1")

        val decision = OutboxCoalescer.decide(restore, listOf(hide))

        assertThat((decision as CoalesceDecision.Annihilate).cancelledCmids).containsExactly("h1")
    }

    @Test
    fun `hiding after a queued restore cancels it as well, and another message is left alone`() {
        val restore = row("r1", OutboxKind.RESTORE_FOR_ME, "m1")

        val cancelled = OutboxCoalescer.decide(row("h1", OutboxKind.HIDE_FOR_ME, "m1"), listOf(restore))
        val other = OutboxCoalescer.decide(row("h2", OutboxKind.HIDE_FOR_ME, "m2"), listOf(restore))

        assertThat((cancelled as CoalesceDecision.Annihilate).cancelledCmids).containsExactly("r1")
        assertThat(other).isInstanceOf(CoalesceDecision.Enqueue::class.java)
    }

    @Test
    fun `a repeated hiding keeps only the latest row`() {
        val first = row("h1", OutboxKind.HIDE_FOR_ME, "m1")
        val second = row("h2", OutboxKind.HIDE_FOR_ME, "m1")

        val decision = OutboxCoalescer.decide(second, listOf(first)) as CoalesceDecision.Replace

        assertThat(decision.supersededCmids).containsExactly("h1")
        assertThat(decision.row.cmid).isEqualTo("h2")
    }

    @Test
    fun `a repeated received receipt of the same conversation keeps only the latest`() {
        val decision = OutboxCoalescer.decide(
            row("a2", OutboxKind.MARK_RECEIVED, "c1"),
            listOf(row("a1", OutboxKind.MARK_RECEIVED, "c1")),
        ) as CoalesceDecision.Replace

        assertThat(decision.supersededCmids).containsExactly("a1")
    }
}
