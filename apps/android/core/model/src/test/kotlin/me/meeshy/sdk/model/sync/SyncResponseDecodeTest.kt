package me.meeshy.sdk.model.sync

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class SyncResponseDecodeTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `une page d'ancre garde son curseur et sa troncature`() {
        val body = """
            {"checkpoint":"2026-10-02T10:00:00.000Z","checkpointSeq":7,"hasGap":false,"hasMore":true,
             "collections":{"conversations":{"added":[{"id":"c1","title":"A","inconnu":1}],"modified":[{"id":"c2"}],
             "deleted":[{"id":"c3","conversationId":"c3","deletedAt":"2026-10-01T00:00:00.000Z"}],
             "truncated":true,"nextCursor":"abc"}}}
        """.trimIndent()

        val page = json.decodeFromString<SyncResponse>(body).conversations!!

        assertThat(page.rows.map { it.id }).containsExactly("c1", "c2").inOrder()
        assertThat(page.deleted.single().id).isEqualTo("c3")
        assertThat(page.truncated).isTrue()
        assertThat(page.nextCursor).isEqualTo("abc")
    }

    @Test
    fun `hasMore, hasGap et le checkpoint se lisent`() {
        val response = json.decodeFromString<SyncResponse>(
            """{"checkpoint":"2026-10-02T10:00:00.000Z","checkpointSeq":9,"hasGap":true,"hasMore":true}""",
        )
        assertThat(response.hasGap).isTrue()
        assertThat(response.hasMore).isTrue()
        assertThat(response.checkpoint).isEqualTo("2026-10-02T10:00:00.000Z")
        assertThat(response.checkpointSeq).isEqualTo(9L)
        assertThat(response.conversations).isNull()
    }

    @Test
    fun `une collection absente ou vide se decode sans erreur`() {
        val response = json.decodeFromString<SyncResponse>("""{"collections":{"conversations":{}}}""")
        assertThat(response.conversations!!.rows).isEmpty()
        assertThat(response.conversations!!.truncated).isFalse()
    }
}
