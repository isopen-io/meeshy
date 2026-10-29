package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** #13500 — a story that did not leave reopens as a draft, under the ids its media have since received. */
class StoryDraftReopeningTest {

    private fun slide(id: String, vararg media: String, backdrop: String? = null) =
        StoryDraftSlideSnapshot(id = id, text = "t-$id", mediaIds = media.toList(), backgroundMediaId = backdrop)

    private fun awaiting(vararg slides: StoryDraftSlideSnapshot, annotations: StoryDraftAnnotations = StoryDraftAnnotations()) =
        StoryComposerDraftSnapshot(
            slides = slides.toList(),
            selectedId = slides.first().id,
            annotations = annotations,
            awaitingPublication = listOf("row-1"),
        )

    @Test
    fun `the draft stops awaiting a publication and keeps everything the author wrote`() {
        val kept = awaiting(
            slide("s1", "m1"),
            annotations = StoryDraftAnnotations(
                mentions = listOf(PostMentionInput(userId = "u1", username = "ana", display = "PINNED")),
                mediaAlt = mapOf("m1" to "un chat"),
                mediaCaption = mapOf("m1" to "Minou"),
                allowSoundExtraction = false,
            ),
        )

        val reopened = StoryDraftReopening.reopened(kept, publishedMediaIds = listOf(listOf("m1")))

        assertThat(reopened.isAwaitingPublication).isFalse()
        assertThat(reopened.annotations).isEqualTo(kept.annotations)
        assertThat(reopened.slides).isEqualTo(kept.slides)
        assertThat(reopened.isWorthRestoring).isTrue()
    }

    @Test
    fun `a media that was uploaded since is put back under its server id, with its alt text, caption and backdrop`() {
        val kept = awaiting(
            slide("s1", "cmid-a", "m2", backdrop = "cmid-a"),
            annotations = StoryDraftAnnotations(mediaAlt = mapOf("cmid-a" to "un chat"), mediaCaption = mapOf("cmid-a" to "Minou", "m2" to "Au marché")),
        )

        val reopened = StoryDraftReopening.reopened(kept, publishedMediaIds = listOf(listOf("srv-a", "m2")))

        assertThat(reopened.slides.single().mediaIds).containsExactly("srv-a", "m2").inOrder()
        assertThat(reopened.slides.single().backgroundMediaId).isEqualTo("srv-a")
        assertThat(reopened.annotations.mediaAlt).containsExactly("srv-a", "un chat")
        assertThat(reopened.annotations.mediaCaption).containsExactly("srv-a", "Minou", "m2", "Au marché")
    }

    @Test
    fun `each slide takes the media of its own publication, in order, text-only slides take none`() {
        val kept = awaiting(slide("s1", "cmid-a"), StoryDraftSlideSnapshot(id = "s2", text = "seul"), slide("s3", "cmid-c"))

        val reopened = StoryDraftReopening.reopened(kept, publishedMediaIds = listOf(listOf("srv-a"), emptyList(), listOf("srv-c")))

        assertThat(reopened.slides.map { it.mediaIds }).containsExactly(listOf("srv-a"), emptyList<String>(), listOf("srv-c")).inOrder()
    }

    @Test
    fun `a publication carrying more than the slide uploaded only renames the slide's own media`() {
        val kept = awaiting(slide("s1", "cmid-a"))

        val reopened = StoryDraftReopening.reopened(kept, publishedMediaIds = listOf(listOf("srv-a", "sound-1")))

        assertThat(reopened.slides.single().mediaIds).containsExactly("srv-a")
    }

    @Test
    fun `a publication that lost media keeps the ids it cannot map, nothing is invented`() {
        val kept = awaiting(slide("s1", "cmid-a", "cmid-b"))

        val reopened = StoryDraftReopening.reopened(kept, publishedMediaIds = listOf(listOf("srv-a")))

        assertThat(reopened.slides.single().mediaIds).containsExactly("cmid-a", "cmid-b").inOrder()
    }

    @Test
    fun `a slide that publishes only its sound takes its own publication, never the next slide's media`() {
        val soundOnly = StoryDraftSlideSnapshot(
            id = "s1",
            text = "en musique",
            audio = listOf(StoryAudioPlayerObject(id = "a1", postMediaId = "sound-1")),
        )
        val kept = awaiting(
            soundOnly,
            slide("s2", "cmid-b"),
            annotations = StoryDraftAnnotations(mediaAlt = mapOf("cmid-b" to "un chat")),
        )

        val reopened = StoryDraftReopening.reopened(kept, publishedMediaIds = listOf(listOf("sound-1"), listOf("srv-b")))

        assertThat(reopened.slides.map { it.mediaIds }).containsExactly(emptyList<String>(), listOf("srv-b")).inOrder()
        assertThat(reopened.annotations.mediaAlt).containsExactly("srv-b", "un chat")
    }

    @Test
    fun `publications that do not pair one to one with the slides rename nothing`() {
        val kept = awaiting(slide("s1", "t1"), slide("s2", "cmid-b"))

        val reopened = StoryDraftReopening.reopened(kept, publishedMediaIds = listOf(listOf("sticker-1"), listOf("t1"), listOf("srv-b")))

        assertThat(reopened.slides.map { it.mediaIds }).containsExactly(listOf("t1"), listOf("cmid-b")).inOrder()
        assertThat(reopened.isAwaitingPublication).isFalse()
    }

    @Test
    fun `a placed media keeps its pose under the server id it received`() {
        val kept = awaiting(
            slide("s1", "cmid-a", "m2").copy(
                placedMedia = listOf(StoryDraftPlacedMediaSnapshot("cmid-a", 0.2f, 0.7f, 1.5f, 12f), StoryDraftPlacedMediaSnapshot("m2")),
            ),
        )

        val reopened = StoryDraftReopening.reopened(kept, publishedMediaIds = listOf(listOf("srv-a", "m2")))

        assertThat(reopened.slides.single().placedMedia)
            .containsExactly(StoryDraftPlacedMediaSnapshot("srv-a", 0.2f, 0.7f, 1.5f, 12f), StoryDraftPlacedMediaSnapshot("m2"))
            .inOrder()
    }
}
