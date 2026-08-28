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
                filter = StoryDraftFilterSnapshot(filter = StoryFilter.VINTAGE, intensity = 0.7f),
                durationSecondsPin = 15.0,
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
        assertThat(restored.slides.first().filter)
            .isEqualTo(StoryDraftFilterSnapshot(filter = StoryFilter.VINTAGE, intensity = 0.7f))
        assertThat(restored.slides.first().durationSecondsPin).isEqualTo(15.0)
        assertThat(restored.slides[1].transform).isNull()
        assertThat(restored.slides[1].filter).isNull()
        assertThat(restored.slides[1].durationSecondsPin).isNull()
    }

    @Test
    fun `a legacy blob without a transform decodes to a null transform`() {
        val legacy = """{"slides":[{"id":"s1","mediaIds":["m1"]}],"selectedId":"s1"}"""

        val decoded = json.decodeFromString(StoryComposerDraftSnapshot.serializer(), legacy)

        assertThat(decoded.slides.single().transform).isNull()
    }

    @Test
    fun `a legacy blob without a filter decodes to a null filter`() {
        val legacy = """{"slides":[{"id":"s1","mediaIds":["m1"]}],"selectedId":"s1"}"""

        val decoded = json.decodeFromString(StoryComposerDraftSnapshot.serializer(), legacy)

        assertThat(decoded.slides.single().filter).isNull()
    }

    @Test
    fun `a legacy blob without a pinned duration decodes to a null pin`() {
        val legacy = """{"slides":[{"id":"s1","mediaIds":["m1"]}],"selectedId":"s1"}"""

        val decoded = json.decodeFromString(StoryComposerDraftSnapshot.serializer(), legacy)

        assertThat(decoded.slides.single().durationSecondsPin).isNull()
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
    fun `a photo filter alone never makes a snapshot worth restoring`() {
        val filterOnly = StoryComposerDraftSnapshot(
            slides = listOf(
                StoryDraftSlideSnapshot(
                    id = "s1",
                    text = "",
                    filter = StoryDraftFilterSnapshot(filter = StoryFilter.BW, intensity = 1f),
                ),
            ),
            selectedId = "s1",
        )
        assertThat(filterOnly.isWorthRestoring).isFalse()
    }

    @Test
    fun `a pinned duration alone never makes a snapshot worth restoring`() {
        val durationOnly = StoryComposerDraftSnapshot(
            slides = listOf(
                StoryDraftSlideSnapshot(id = "s1", text = "", durationSecondsPin = 12.0),
            ),
            selectedId = "s1",
        )
        assertThat(durationOnly.isWorthRestoring).isFalse()
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

    @Test
    fun `a changed photo filter is different content`() {
        val a = sample()
        val b = a.copy(
            slides = a.slides.mapIndexed { i, s ->
                if (i == 0) s.copy(filter = StoryDraftFilterSnapshot(filter = StoryFilter.COOL, intensity = 0.7f)) else s
            },
        )
        assertThat(a.sameContentAs(b)).isFalse()
    }

    @Test
    fun `a changed filter intensity alone is different content`() {
        val a = sample()
        val b = a.copy(
            slides = a.slides.mapIndexed { i, s ->
                if (i == 0) s.copy(filter = s.filter?.copy(intensity = 0.1f)) else s
            },
        )
        assertThat(a.sameContentAs(b)).isFalse()
    }

    @Test
    fun `clearing a photo filter is different content`() {
        val a = sample()
        val b = a.copy(slides = a.slides.mapIndexed { i, s -> if (i == 0) s.copy(filter = null) else s })
        assertThat(a.sameContentAs(b)).isFalse()
    }

    @Test
    fun `a changed pinned duration is different content`() {
        val a = sample()
        val b = a.copy(slides = a.slides.mapIndexed { i, s -> if (i == 0) s.copy(durationSecondsPin = 42.0) else s })
        assertThat(a.sameContentAs(b)).isFalse()
    }

    @Test
    fun `clearing a pinned duration is different content`() {
        val a = sample()
        val b = a.copy(slides = a.slides.mapIndexed { i, s -> if (i == 0) s.copy(durationSecondsPin = null) else s })
        assertThat(a.sameContentAs(b)).isFalse()
    }
}
