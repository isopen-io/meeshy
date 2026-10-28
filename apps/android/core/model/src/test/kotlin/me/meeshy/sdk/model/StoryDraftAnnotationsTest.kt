package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/** #13451 — what the author attached beside the slides survives the durable snapshot. */
class StoryDraftAnnotationsTest {

    private val json = Json { ignoreUnknownKeys = true }

    private fun annotated() = StoryComposerDraftSnapshot(
        slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "salut", mediaIds = listOf("m1"))),
        selectedId = "s1",
        annotations = StoryDraftAnnotations(
            mentions = listOf(PostMentionInput(userId = "u1", username = "ana", display = "PINNED")),
            mediaAlt = mapOf("m1" to "un chat"),
            mediaCaption = mapOf("m1" to "Minou"),
            allowSoundExtraction = false,
        ),
    )

    @Test
    fun `mentions, alt texts, captions and sound extraction round-trip`() {
        val decoded = json.decodeFromString(
            StoryComposerDraftSnapshot.serializer(),
            json.encodeToString(StoryComposerDraftSnapshot.serializer(), annotated()),
        )

        assertThat(decoded.annotations).isEqualTo(annotated().annotations)
        assertThat(decoded.annotations.allowSoundExtraction).isFalse()
    }

    @Test
    fun `a blob written before the annotations decodes to nothing attached`() {
        val legacy = """{"slides":[{"id":"s1","text":"avant"}],"selectedId":"s1","visibility":"PUBLIC"}"""

        val decoded = json.decodeFromString(StoryComposerDraftSnapshot.serializer(), legacy)

        assertThat(decoded.annotations).isEqualTo(StoryDraftAnnotations())
        assertThat(decoded.annotations.allowSoundExtraction).isNull()
    }

    @Test
    fun `a change of annotation is a change of draft content`() {
        val base = annotated()

        assertThat(base.sameContentAs(base.copy(updatedAt = "later"))).isTrue()
        assertThat(base.sameContentAs(base.copy(annotations = base.annotations.copy(mediaAlt = emptyMap())))).isFalse()
        assertThat(base.sameContentAs(base.copy(annotations = base.annotations.copy(allowSoundExtraction = null)))).isFalse()
    }

    @Test
    fun `keepingMedia drops the descriptions of media that are gone`() {
        val kept = annotated().annotations.keepingMedia(listOf("m2"))

        assertThat(kept.mediaAlt).isEmpty()
        assertThat(kept.mediaCaption).isEmpty()
        assertThat(kept.mentions).hasSize(1)
    }
}
