package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class PostComposerDraftSnapshotTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `a draft with media kept on the device round-trips its placeholders and their metadata`() {
        val draft = PostComposerDraftSnapshot(
            text = "mes photos",
            visibility = "FRIENDS",
            media = listOf(UploadedMedia("cmid_a", "content://picked/1", "image/heic", 3L, null, null, null, null)),
            location = SharedPlace(latitude = 1.0, longitude = 2.0),
            language = "fr",
            mediaAlt = mapOf("cmid_a" to "un chat"),
            updatedAtMillis = 7L,
        )

        val decoded = json.decodeFromString(
            PostComposerDraftSnapshot.serializer(),
            json.encodeToString(PostComposerDraftSnapshot.serializer(), draft),
        )

        assertThat(decoded).isEqualTo(draft)
    }

    @Test
    fun `a partial blob from another build decodes with defaults`() {
        val decoded = json.decodeFromString(PostComposerDraftSnapshot.serializer(), """{"text":"x","future":1}""")

        assertThat(decoded.text).isEqualTo("x")
        assertThat(decoded.visibility).isEqualTo("PUBLIC")
        assertThat(decoded.media).isEmpty()
    }

    @Test
    fun `only words or media are worth restoring, and the timestamp is not content`() {
        assertThat(PostComposerDraftSnapshot(text = "  ").isWorthRestoring).isFalse()
        assertThat(PostComposerDraftSnapshot(text = "a").isWorthRestoring).isTrue()
        assertThat(PostComposerDraftSnapshot(text = "a", updatedAtMillis = 1L).sameContentAs(PostComposerDraftSnapshot(text = "a", updatedAtMillis = 2L)))
            .isTrue()
    }
}
