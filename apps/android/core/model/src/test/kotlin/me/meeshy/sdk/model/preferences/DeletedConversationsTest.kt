package me.meeshy.sdk.model.preferences

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import java.time.Instant
import org.junit.Test

class DeletedConversationsTest {

    private fun at(iso: String) = Instant.parse(iso).toEpochMilli()

    private val served = Json.parseToJsonElement(
        """[
          {"conversationId":"c1","conversation":{"id":"c1","title":"A"},"deletedAt":"2026-10-01T10:00:00.000Z"},
          {"conversationId":"c2","deletedAt":"2026-10-05T10:00:00.000Z"},
          {"conversation":{"id":"c3"},"deletedAt":null},
          {"deletedAt":"2026-10-06T10:00:00.000Z"},
          "garbage",
          {"conversationId":"c5","deletedAt":"not a date"}
        ]""",
    )

    @Test
    fun `a malformed row is ignored alone and the others are read`() {
        val rows = deletedConversationsFromJson(served)

        assertThat(rows.map { it.conversationId }).containsExactly("c1", "c2", "c3", "c5").inOrder()
        assertThat(rows[0].deletedAtMillis).isEqualTo(at("2026-10-01T10:00:00Z"))
        assertThat(rows[2].deletedAtMillis).isNull()
        assertThat(rows[3].deletedAtMillis).isNull()
    }

    @Test
    fun `catching up since a date keeps the later deletions and the undated ones`() {
        val rows = deletedConversationsFromJson(served)

        val since = rows.deletedSince(at("2026-10-03T00:00:00Z"))

        assertThat(since.map { it.conversationId }).containsExactly("c2", "c3", "c5").inOrder()
    }

    @Test
    fun `no bound returns everything and a non array body returns nothing`() {
        assertThat(deletedConversationsFromJson(served).deletedSince(null)).hasSize(4)
        assertThat(deletedConversationsFromJson(null)).isEmpty()
        assertThat(deletedConversationsFromJson(Json.parseToJsonElement("{}"))).isEmpty()
    }

    @Test
    fun `ids are distinct and in served order`() {
        val rows = listOf(
            DeletedConversationEntry("b"), DeletedConversationEntry("a"), DeletedConversationEntry("b"),
        )

        assertThat(rows.ids()).containsExactly("b", "a").inOrder()
    }

    @Test
    fun `the community order is complete and indexed`() {
        val body = communityReorderOf(listOf("x", "y", "x", "z"))

        assertThat(body.updates.map { it.communityId to it.orderInCategory })
            .containsExactly("x" to 0, "y" to 1, "z" to 2).inOrder()
    }
}
