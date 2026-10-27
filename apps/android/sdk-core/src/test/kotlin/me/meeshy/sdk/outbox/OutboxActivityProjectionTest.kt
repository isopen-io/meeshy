package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.model.ongoing.OutboxActivityKind
import org.junit.Test

class OutboxActivityProjectionTest {

    private fun row(
        cmid: String,
        kind: OutboxKind,
        state: OutboxState = OutboxState.PENDING,
        dependsOn: String? = null,
        payload: String = "{\"text\":\"secret\"}",
    ) = OutboxEntity(
        cmid = cmid, lane = "lane", kind = kind.name, targetId = "t", payload = payload,
        dependsOn = dependsOn, attempts = 0, state = state.name, createdAt = 1L, updatedAt = 1L,
    )

    @Test
    fun `kinds map to the neutral activity kinds`() {
        val items = OutboxActivityProjection.project(
            listOf(
                row("s", OutboxKind.PUBLISH_STORY),
                row("u", OutboxKind.UPLOAD_MEDIA),
                row("t", OutboxKind.SEND_MESSAGE),
                row("r", OutboxKind.ADD_REACTION),
            ),
        )

        assertThat(items.map { it.kind }).containsExactly(
            OutboxActivityKind.Story,
            OutboxActivityKind.Media,
            OutboxActivityKind.Text,
            OutboxActivityKind.Other,
        ).inOrder()
    }

    @Test
    fun `a message behind an upload is a message with media that names its prerequisite`() {
        val key = OutboxDependencyKey.encode(listOf("up"))

        val item = OutboxActivityProjection.project(listOf(row("m", OutboxKind.SEND_MESSAGE, dependsOn = key))).single()

        assertThat(item.kind).isEqualTo(OutboxActivityKind.MessageWithMedia)
        assertThat(item.dependsOnIds).containsExactly("up")
    }

    @Test
    fun `an exhausted row is terminal and the payload never travels`() {
        val item = OutboxActivityProjection.project(listOf(row("u", OutboxKind.UPLOAD_MEDIA, OutboxState.EXHAUSTED))).single()

        assertThat(item.isTerminal).isTrue()
        assertThat(item.toString()).doesNotContain("secret")
    }
}
