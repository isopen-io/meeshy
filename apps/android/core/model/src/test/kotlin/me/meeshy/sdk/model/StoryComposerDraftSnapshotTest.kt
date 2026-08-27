package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * [StoryComposerDraftSnapshot] — the durable, primitive-only form of a story composer
 * draft. Proves the round-trip is faithful and total, and that the three consumer
 * predicates ([isStructurallyValid], [isWorthRestoring], [sameContentAs]) gate a stored
 * blob exactly the way the autosave/store contract needs.
 */
class StoryComposerDraftSnapshotTest {

    private val json = Json { ignoreUnknownKeys = true }

    private fun sample() = StoryComposerDraftSnapshot(
        slides = listOf(
            StoryDraftSlideSnapshot(
                id = "s1",
                text = "one",
                mediaIds = listOf("m1", "m2"),
                transform = StoryDraftTransformSnapshot(scale = 2.5f, offsetX = 12f, offsetY = -8f),
            ),
            StoryDraftSlideSnapshot(id = "s2", text = "two"),
        ),
        selectedId = "s2",
        visibility = "FRIENDS",
        repostOfId = "src-9",
        updatedAt = "2026-08-26T00:00:00Z",
    )

    @Test
    fun `a fully populated snapshot survives a JSON round-trip unchanged`() {
        val original = sample()

        val restored = json.decodeFromString(
            StoryComposerDraftSnapshot.serializer(),
            json.encodeToString(StoryComposerDraftSnapshot.serializer(), original),
        )

        assertThat(restored).isEqualTo(original)
        assertThat(restored.slides.first().transform)
            .isEqualTo(StoryDraftTransformSnapshot(scale = 2.5f, offsetX = 12f, offsetY = -8f))
        assertThat(restored.slides[1].transform).isNull()
    }

    @Test
    fun `a legacy blob without a transform decodes to a null transform`() {
        val legacy = """{"slides":[{"id":"s1","mediaIds":["m1"]}],"selectedId":"s1"}"""

        val decoded = json.decodeFromString(StoryComposerDraftSnapshot.serializer(), legacy)

        assertThat(decoded.slides.single().transform).isNull()
    }

    @Test
    fun `a legacy blob missing every optional field decodes to defaults`() {
        val legacy = """{"slides":[{"id":"s1"}],"selectedId":"s1"}"""

        val decoded = json.decodeFromString(StoryComposerDraftSnapshot.serializer(), legacy)

        assertThat(decoded.visibility).isEqualTo(StoryComposerDraftSnapshot.DEFAULT_VISIBILITY)
        assertThat(decoded.repostOfId).isNull()
        assertThat(decoded.updatedAt).isNull()
        assertThat(decoded.slides.single().text).isEmpty()
        assertThat(decoded.slides.single().mediaIds).isEmpty()
    }

    // ---- isStructurallyValid ----

    @Test
    fun `an empty-slide snapshot is not structurally valid`() {
        assertThat(StoryComposerDraftSnapshot(slides = emptyList(), selectedId = "s1").isStructurallyValid).isFalse()
    }

    @Test
    fun `a selection naming no present slide is not structurally valid`() {
        val snap = StoryComposerDraftSnapshot(
            slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "x")),
            selectedId = "ghost",
        )
        assertThat(snap.isStructurallyValid).isFalse()
    }

    @Test
    fun `slides with a present selection are structurally valid`() {
        assertThat(sample().isStructurallyValid).isTrue()
    }

    // ---- isWorthRestoring ----

    @Test
    fun `a valid but content-empty snapshot is not worth restoring`() {
        val blank = StoryComposerDraftSnapshot(
            slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "   ")),
            selectedId = "s1",
        )
        assertThat(blank.isWorthRestoring).isFalse()
    }

    @Test
    fun `media alone makes a snapshot worth restoring`() {
        val mediaOnly = StoryComposerDraftSnapshot(
            slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "", mediaIds = listOf("m1"))),
            selectedId = "s1",
        )
        assertThat(mediaOnly.isWorthRestoring).isTrue()
    }

    @Test
    fun `a canvas transform alone never makes a snapshot worth restoring`() {
        val transformOnly = StoryComposerDraftSnapshot(
            slides = listOf(
                StoryDraftSlideSnapshot(
                    id = "s1",
                    text = "",
                    transform = StoryDraftTransformSnapshot(scale = 2f, offsetX = 5f, offsetY = 0f),
                ),
            ),
            selectedId = "s1",
        )
        assertThat(transformOnly.isWorthRestoring).isFalse()
    }

    @Test
    fun `a structurally invalid snapshot is never worth restoring even with content`() {
        val invalid = StoryComposerDraftSnapshot(
            slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "content")),
            selectedId = "ghost",
        )
        assertThat(invalid.isWorthRestoring).isFalse()
    }

    // ---- sameContentAs (ignores updatedAt) ----

    @Test
    fun `two snapshots differing only in updatedAt are the same content`() {
        val a = sample()
        val b = a.copy(updatedAt = "2099-01-01T00:00:00Z")
        assertThat(a.sameContentAs(b)).isTrue()
    }

    @Test
    fun `a changed caption is different content`() {
        val a = sample()
        val b = a.copy(slides = a.slides.map { it.copy(text = it.text + "!") })
        assertThat(a.sameContentAs(b)).isFalse()
    }

    @Test
    fun `a changed visibility is different content`() {
        val a = sample()
        assertThat(a.sameContentAs(a.copy(visibility = "PUBLIC"))).isFalse()
    }

    @Test
    fun `a changed canvas transform is different content`() {
        val a = sample()
        val b = a.copy(
            slides = a.slides.mapIndexed { i, s ->
                if (i == 0) s.copy(transform = StoryDraftTransformSnapshot(scale = 3f, offsetX = 0f, offsetY = 0f)) else s
            },
        )
        assertThat(a.sameContentAs(b)).isFalse()
    }

    @Test
    fun `clearing a canvas transform is different content`() {
        val a = sample()
        val b = a.copy(slides = a.slides.mapIndexed { i, s -> if (i == 0) s.copy(transform = null) else s })
        assertThat(a.sameContentAs(b)).isFalse()
    }
}
