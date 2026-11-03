package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.model.sync.OutboxNavigationSource
import me.meeshy.sdk.model.sync.OutboxUiIcon
import me.meeshy.sdk.model.sync.OutboxUiKind
import me.meeshy.sdk.model.sync.OutboxUiStatus
import org.junit.Test

class OutboxUiItemTest {
    private fun row(
        kind: OutboxKind,
        payload: String = "{}",
        lane: String = "lane",
        targetId: String = "t1",
        cmid: String = "c1",
        state: OutboxState = OutboxState.PENDING,
        createdAt: Long = 10,
        updatedAt: Long = 20,
    ) = OutboxEntity(cmid, lane, kind.name, targetId, payload, null, 0, state.name, createdAt, updatedAt)

    @Test
    fun `a text send keeps its truncated preview and anchors on the local bubble`() {
        val item = row(OutboxKind.SEND_MESSAGE, """{"content":"${"a".repeat(70)}","attachmentIds":[]}""", targetId = "conv1", cmid = "local-9").toUiItem()!!
        assertThat(item.kind).isEqualTo(OutboxUiKind.MESSAGE)
        assertThat(item.titlePreview).isEqualTo("a".repeat(60) + "…")
        assertThat(item.iconKind).isEqualTo(OutboxUiIcon.TEXT)
        assertThat(item.source).isEqualTo(OutboxNavigationSource.Conversation("conv1", "local-9"))
        assertThat(item.createdAt).isEqualTo(10)
        assertThat(item.updatedAt).isEqualTo(20)
    }

    @Test
    fun `a voice note without text is an audio item with its attachments counted`() {
        val item = row(OutboxKind.SEND_MESSAGE, """{"content":"","messageType":"audio","attachmentIds":["a1"]}""").toUiItem()!!
        assertThat(item.iconKind).isEqualTo(OutboxUiIcon.AUDIO)
        assertThat(item.attachmentCount).isEqualTo(1)
    }

    @Test
    fun `a protected or encrypted message never leaks its text into the preview`() {
        val viewOnce = row(OutboxKind.SEND_MESSAGE, """{"content":"secret","isViewOnce":true}""").toUiItem()!!
        val blurred = row(OutboxKind.SEND_MESSAGE, """{"content":"secret","isBlurred":true}""").toUiItem()!!
        val e2ee = row(OutboxKind.SEND_E2EE_MESSAGE, """{"content":"secret"}""").toUiItem()!!
        listOf(viewOnce, blurred, e2ee).forEach { assertThat(it.titlePreview).isNull() }
    }

    @Test
    fun `an unreadable payload degrades to safe defaults without an anchor on a mutation`() {
        val item = row(OutboxKind.EDIT_MESSAGE, payload = "not json", lane = "message:conv1", targetId = "srv1").toUiItem()!!
        assertThat(item.kind).isEqualTo(OutboxUiKind.EDIT)
        assertThat(item.titlePreview).isNull()
        assertThat(item.source).isEqualTo(OutboxNavigationSource.Conversation("conv1", "srv1"))
        val orphan = row(OutboxKind.EDIT_MESSAGE, lane = "weird", targetId = "srv1").toUiItem()!!
        assertThat(orphan.source).isEqualTo(OutboxNavigationSource.Unknown)
    }

    @Test
    fun `a reaction anchors on the server message of its conversation`() {
        val item = row(OutboxKind.ADD_REACTION, """{"emoji":"🔥","conversationId":"conv7"}""", targetId = "srv5").toUiItem()!!
        assertThat(item.titlePreview).isEqualTo("🔥")
        assertThat(item.iconKind).isEqualTo(OutboxUiIcon.REACTION)
        assertThat(item.source).isEqualTo(OutboxNavigationSource.Conversation("conv7", "srv5"))
    }

    @Test
    fun `comments and post gestures lead to the post, stories to the story once published`() {
        assertThat(row(OutboxKind.CREATE_COMMENT, """{"content":"hi"}""", targetId = "p1").toUiItem()!!.source)
            .isEqualTo(OutboxNavigationSource.Post("p1"))
        assertThat(row(OutboxKind.LIKE_POST, targetId = "p2").toUiItem()!!.source).isEqualTo(OutboxNavigationSource.Post("p2"))
        assertThat(row(OutboxKind.PUBLISH_STORY, targetId = "pending_x").toUiItem()!!.source).isEqualTo(OutboxNavigationSource.Unknown)
        assertThat(row(OutboxKind.PUBLISH_STORY, targetId = "s1").toUiItem()!!.source).isEqualTo(OutboxNavigationSource.Story("s1"))
    }

    @Test
    fun `a queued repost reads as a repost and leads to the source post`() {
        val item = row(OutboxKind.REPOST_POST, """{"targetType":"POST","content":"à voir","isQuote":true}""", targetId = "p9").toUiItem()!!
        assertThat(item.kind).isEqualTo(OutboxUiKind.OTHER)
        assertThat(item.otherKey).isEqualTo("repostPost")
        assertThat(item.titlePreview).isEqualTo("à voir")
        assertThat(item.source).isEqualTo(OutboxNavigationSource.Post("p9"))
    }

    @Test
    fun `the state maps and an exhausted row is terminal`() {
        val item = row(OutboxKind.SEND_MESSAGE, state = OutboxState.EXHAUSTED).toUiItem()!!
        assertThat(item.status).isEqualTo(OutboxUiStatus.EXHAUSTED)
        assertThat(item.status.isTerminal).isTrue()
        assertThat(row(OutboxKind.SEND_MESSAGE, state = OutboxState.INFLIGHT).toUiItem()!!.status).isEqualTo(OutboxUiStatus.INFLIGHT)
    }

    @Test
    fun `an unknown kind written by a newer build is ignored`() {
        val unknown = row(OutboxKind.SEND_MESSAGE).copy(kind = "FUTURE_KIND")
        assertThat(unknown.toUiItem()).isNull()
    }

    @Test
    fun `every outbox kind has a pill formulation`() {
        OutboxKind.entries.forEach { kind ->
            val facts = OutboxRowFacts.pillFacts(kind)
            if (facts.kind == OutboxUiKind.OTHER) assertThat(facts.otherKey).isNotEmpty()
        }
    }
}
