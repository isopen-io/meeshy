package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import org.junit.Test

class StoryDraftMediaReconcilerTest {

    private fun snapshot(vararg slides: StoryDraftSlideSnapshot): StoryComposerDraftSnapshot =
        StoryComposerDraftSnapshot(slides = slides.toList(), selectedId = slides.first().id)

    private fun availabilityOf(vararg available: String): (String) -> Boolean =
        { id -> id in available.toSet() }

    @Test
    fun `all media available leaves the snapshot content-unchanged and reports no loss`() {
        val original = snapshot(
            StoryDraftSlideSnapshot(id = "s1", text = "hi", mediaIds = listOf("m1", "m2")),
            StoryDraftSlideSnapshot(id = "s2", mediaIds = listOf("m3")),
        )

        val result = StoryDraftMediaReconciler.reconcile(original, availabilityOf("m1", "m2", "m3"))

        assertThat(result.snapshot.sameContentAs(original)).isTrue()
        assertThat(result.lostMediaIds).isEmpty()
        assertThat(result.recaptureSlideIds).isEmpty()
        assertThat(result.hasLoss).isFalse()
    }

    @Test
    fun `an unavailable media id is removed from its slide and reported lost`() {
        val original = snapshot(
            StoryDraftSlideSnapshot(id = "s1", text = "hi", mediaIds = listOf("keep", "gone")),
        )

        val result = StoryDraftMediaReconciler.reconcile(original, availabilityOf("keep"))

        assertThat(result.snapshot.slides.single().mediaIds).containsExactly("keep")
        assertThat(result.lostMediaIds).containsExactly("gone")
        assertThat(result.hasLoss).isTrue()
    }

    @Test
    fun `surviving media keep their original order after a middle id is dropped`() {
        val original = snapshot(
            StoryDraftSlideSnapshot(id = "s1", mediaIds = listOf("a", "gone", "b", "c")),
        )

        val result = StoryDraftMediaReconciler.reconcile(original, availabilityOf("a", "b", "c"))

        assertThat(result.snapshot.slides.single().mediaIds).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun `a slide emptied of all content by the loss is flagged for re-capture`() {
        val original = snapshot(
            StoryDraftSlideSnapshot(id = "s1", text = "", mediaIds = listOf("gone")),
        )

        val result = StoryDraftMediaReconciler.reconcile(original, availabilityOf())

        assertThat(result.snapshot.slides.single().mediaIds).isEmpty()
        assertThat(result.recaptureSlideIds).containsExactly("s1")
        assertThat(result.lostMediaIds).containsExactly("gone")
    }

    @Test
    fun `a slide that keeps its caption after losing its media is not a re-capture slide`() {
        val original = snapshot(
            StoryDraftSlideSnapshot(id = "s1", text = "a thought", mediaIds = listOf("gone")),
        )

        val result = StoryDraftMediaReconciler.reconcile(original, availabilityOf())

        assertThat(result.snapshot.slides.single().text).isEqualTo("a thought")
        assertThat(result.snapshot.slides.single().mediaIds).isEmpty()
        assertThat(result.recaptureSlideIds).isEmpty()
        assertThat(result.lostMediaIds).containsExactly("gone")
    }

    @Test
    fun `a whitespace-only caption does not save a media-less slide from re-capture`() {
        val original = snapshot(
            StoryDraftSlideSnapshot(id = "s1", text = "   ", mediaIds = listOf("gone")),
        )

        val result = StoryDraftMediaReconciler.reconcile(original, availabilityOf())

        assertThat(result.recaptureSlideIds).containsExactly("s1")
    }

    @Test
    fun `a slide that still has one surviving media is not flagged for re-capture`() {
        val original = snapshot(
            StoryDraftSlideSnapshot(id = "s1", text = "", mediaIds = listOf("keep", "gone")),
        )

        val result = StoryDraftMediaReconciler.reconcile(original, availabilityOf("keep"))

        assertThat(result.recaptureSlideIds).isEmpty()
        assertThat(result.lostMediaIds).containsExactly("gone")
    }

    @Test
    fun `no slide is ever removed so the selection stays valid even when a whole slide empties`() {
        val original = StoryComposerDraftSnapshot(
            slides = listOf(
                StoryDraftSlideSnapshot(id = "s1", mediaIds = listOf("keep")),
                StoryDraftSlideSnapshot(id = "s2", mediaIds = listOf("gone")),
            ),
            selectedId = "s2",
        )

        val result = StoryDraftMediaReconciler.reconcile(original, availabilityOf("keep"))

        assertThat(result.snapshot.slides.map { it.id }).containsExactly("s1", "s2").inOrder()
        assertThat(result.snapshot.isStructurallyValid).isTrue()
        assertThat(result.snapshot.selectedId).isEqualTo("s2")
    }

    @Test
    fun `losing the only media on every slide leaves a snapshot that is no longer worth restoring`() {
        val original = StoryComposerDraftSnapshot(
            slides = listOf(
                StoryDraftSlideSnapshot(id = "s1", mediaIds = listOf("g1")),
                StoryDraftSlideSnapshot(id = "s2", mediaIds = listOf("g2")),
            ),
            selectedId = "s1",
        )

        val result = StoryDraftMediaReconciler.reconcile(original, availabilityOf())

        assertThat(result.snapshot.isWorthRestoring).isFalse()
        assertThat(result.lostMediaIds).containsExactly("g1", "g2").inOrder()
        assertThat(result.recaptureSlideIds).containsExactly("s1", "s2").inOrder()
    }

    @Test
    fun `lost ids are reported in first-seen slide-then-position order`() {
        val original = StoryComposerDraftSnapshot(
            slides = listOf(
                StoryDraftSlideSnapshot(id = "s1", text = "t", mediaIds = listOf("g1", "keep", "g2")),
                StoryDraftSlideSnapshot(id = "s2", text = "t", mediaIds = listOf("g3")),
            ),
            selectedId = "s1",
        )

        val result = StoryDraftMediaReconciler.reconcile(original, availabilityOf("keep"))

        assertThat(result.lostMediaIds).containsExactly("g1", "g2", "g3").inOrder()
    }

    @Test
    fun `a slide with no media at all is left untouched and never flagged`() {
        val original = snapshot(
            StoryDraftSlideSnapshot(id = "s1", text = "just words"),
        )

        val result = StoryDraftMediaReconciler.reconcile(original, availabilityOf())

        assertThat(result.snapshot.slides.single()).isEqualTo(original.slides.single())
        assertThat(result.lostMediaIds).isEmpty()
        assertThat(result.recaptureSlideIds).isEmpty()
        assertThat(result.hasLoss).isFalse()
    }

    @Test
    fun `reconciling an already-clean snapshot is idempotent`() {
        val original = snapshot(
            StoryDraftSlideSnapshot(id = "s1", text = "hi", mediaIds = listOf("keep")),
        )
        val once = StoryDraftMediaReconciler.reconcile(original, availabilityOf("keep"))

        val twice = StoryDraftMediaReconciler.reconcile(once.snapshot, availabilityOf("keep"))

        assertThat(twice.snapshot.sameContentAs(once.snapshot)).isTrue()
        assertThat(twice.hasLoss).isFalse()
    }

    @Test
    fun `visibility selection and repost link survive reconciliation`() {
        val original = StoryComposerDraftSnapshot(
            slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "hi", mediaIds = listOf("gone"))),
            selectedId = "s1",
            visibility = "FRIENDS",
            repostOfId = "src99",
        )

        val result = StoryDraftMediaReconciler.reconcile(original, availabilityOf())

        assertThat(result.snapshot.visibility).isEqualTo("FRIENDS")
        assertThat(result.snapshot.repostOfId).isEqualTo("src99")
    }
}
