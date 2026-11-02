package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RecentlyCreatedMergeTest {

    private data class Row(val id: String, val origin: String)

    private fun merge(server: List<Row>, local: List<Row>, createdAt: Map<String, Long>, now: Long) =
        RecentlyCreatedMerge.merge(server, local, { it.id }, createdAt, now)

    @Test
    fun `une conversation creee il y a moins de 30 s et absente du serveur est conservee`() {
        val merged = merge(
            server = listOf(Row("a", "server")),
            local = listOf(Row("new", "local"), Row("a", "local")),
            createdAt = mapOf("new" to 1_000L),
            now = 1_000L + 29_999L,
        )

        assertThat(merged).containsExactly(Row("new", "local"), Row("a", "server")).inOrder()
    }

    @Test
    fun `passe 30 s la conversation absente du serveur est evincee`() {
        val merged = merge(
            server = listOf(Row("a", "server")),
            local = listOf(Row("new", "local")),
            createdAt = mapOf("new" to 1_000L),
            now = 1_000L + 30_000L,
        )

        assertThat(merged).containsExactly(Row("a", "server"))
    }

    @Test
    fun `une conversation servie garde la version serveur`() {
        val merged = merge(
            server = listOf(Row("new", "server")),
            local = listOf(Row("new", "local")),
            createdAt = mapOf("new" to 0L),
            now = 10L,
        )

        assertThat(merged).containsExactly(Row("new", "server"))
    }

    @Test
    fun `une conversation locale ancienne non creee ici n est pas reportee`() {
        val merged = merge(server = emptyList(), local = listOf(Row("old", "local")), createdAt = emptyMap(), now = 0L)

        assertThat(merged).isEmpty()
    }

    @Test
    fun `les identifiants proteges et l eviction suivent la meme fenetre`() {
        val registry = mapOf("fresh" to 10_000L, "old" to 0L)

        assertThat(RecentlyCreatedMerge.protectedIds(registry, nowMillis = 30_000L)).containsExactly("fresh")
        assertThat(RecentlyCreatedMerge.evictExpired(registry, nowMillis = 30_000L)).containsExactly("fresh", 10_000L)
    }

    @Test
    fun `un instant futur n est pas protege`() {
        assertThat(RecentlyCreatedMerge.protectedIds(mapOf("x" to 5_000L), nowMillis = 0L)).isEmpty()
    }
}
