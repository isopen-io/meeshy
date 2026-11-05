package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryDeltaCursorTest {
    private fun post(id: String, updatedAt: String?) = ApiPost(id = id, type = "STORY", updatedAt = updatedAt)

    @Test
    fun `the cursor is the greatest updatedAt held`() {
        val posts = listOf(post("a", "2026-11-01T10:00:00.000Z"), post("b", "2026-11-03T08:00:00.000Z"), post("c", "2026-11-02T08:00:00.000Z"))
        assertThat(StoryDeltaCursor.of(posts)).isEqualTo("2026-11-03T08:00:00.000Z")
    }

    @Test
    fun `no updatedAt anywhere means a full fetch`() {
        assertThat(StoryDeltaCursor.of(listOf(post("a", null)))).isNull()
        assertThat(StoryDeltaCursor.of(emptyList())).isNull()
    }

    @Test
    fun `an unreadable updatedAt never becomes the cursor`() {
        assertThat(StoryDeltaCursor.of(listOf(post("a", "garbage"), post("b", "2026-11-01T10:00:00Z")))).isEqualTo("2026-11-01T10:00:00Z")
    }
}
