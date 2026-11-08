package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class StoryDraftAccessibilityTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `a blob written before accessibility, captions and editing link still reads`() {
        val old = """{"slides":[{"id":"s1","text":"a"}],"selectedId":"s1"}"""
        val decoded = json.decodeFromString(StoryComposerDraftSnapshot.serializer(), old)

        assertThat(decoded.annotations).isEqualTo(StoryDraftAnnotations())
        assertThat(decoded.annotations.allowSoundExtraction).isNull()
        assertThat(decoded.editingPostId).isNull()
    }

    @Test
    fun `a blob with alt texts but no captions keeps the alt texts`() {
        val old = """{"slides":[{"id":"s1"}],"selectedId":"s1","annotations":{"mediaAlt":{"m":"chat"}}}"""
        val decoded = json.decodeFromString(StoryComposerDraftSnapshot.serializer(), old)

        assertThat(decoded.annotations.mediaAlt).containsExactly("m", "chat")
        assertThat(decoded.annotations.mediaCaption).isEmpty()
    }

    @Test
    fun `the editing link round-trips and counts as content`() {
        val a = StoryComposerDraftSnapshot(slides = listOf(StoryDraftSlideSnapshot(id = "s1")), selectedId = "s1", editingPostId = "p1")
        val back = json.decodeFromString(StoryComposerDraftSnapshot.serializer(), json.encodeToString(StoryComposerDraftSnapshot.serializer(), a))

        assertThat(back.editingPostId).isEqualTo("p1")
        assertThat(a.sameContentAs(a.copy(editingPostId = null))).isFalse()
    }

    @Test
    fun `a summary needs at least one slide and finds its cover on disk`() {
        val meta = StoryDraftMeta(slideCount = 2, coverCandidates = listOf("a.jpg", "b.jpg"))
        val summary = meta.toSummary("d", "/m") { it == "/m/b.jpg" }!!

        assertThat(summary.coverFilePath).isEqualTo("/m/b.jpg")
        assertThat(StoryDraftMeta(slideCount = 0).toSummary("d", "/m") { true }).isNull()
    }
}
