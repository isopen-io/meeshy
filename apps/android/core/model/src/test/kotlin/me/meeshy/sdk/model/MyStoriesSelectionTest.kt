package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MyStoriesSelectionTest {

    private fun post(id: String, createdAt: String, content: String? = null) =
        ApiPost(id = id, type = "STORY", createdAt = createdAt, content = content)

    @Test
    fun `une story absente de la liste sort de la selection`() {
        assertThat(MyStoriesSelection.liveSelection(setOf("a", "b", "gone"), listOf("a", "b", "c")))
            .containsExactly("a", "b")
    }

    @Test
    fun `la fusion garde la version fraiche, sans doublon, la plus recente d'abord`() {
        val merged = MyStoriesSelection.merge(
            fresh = listOf(post("b", "2026-10-02T00:00:00Z", "frais")),
            archive = listOf(post("a", "2026-10-01T00:00:00Z"), post("b", "2026-10-02T00:00:00Z", "vieux")),
        )
        assertThat(merged.map { it.id }).containsExactly("b", "a").inOrder()
        assertThat(merged.first().content).isEqualTo("frais")
    }
}
