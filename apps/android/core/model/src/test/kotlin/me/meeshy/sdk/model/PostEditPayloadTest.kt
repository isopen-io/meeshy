package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PostEditPayloadTest {
    private val full = PostEditDraft(
        content = "salut",
        visibility = "FRIENDS",
        visibilityUserIds = listOf("u1"),
        moodEmoji = "😀",
        originalLanguage = "fr",
        type = "REEL",
        removeMediaIds = listOf("m1"),
        mediaIds = listOf("m2"),
        location = PostLocationUpdate.Remove,
        mentions = emptyList(),
        allowSoundExtraction = true,
        mediaAlt = mapOf("m2" to "a"),
        mediaCaption = mapOf("m2" to "c"),
    )

    @Test
    fun `only known fields survive`() {
        val built = PostEditPayload.build(setOf(PostEditField.CONTENT, PostEditField.VISIBILITY), full)
        assertThat(built).isEqualTo(PostEditDraft(content = "salut", visibility = "FRIENDS"))
    }

    @Test
    fun `an empty known set sends nothing`() {
        assertThat(PostEditPayload.build(emptySet(), full)).isEqualTo(PostEditDraft())
    }

    @Test
    fun `ALL keeps the whole draft`() {
        assertThat(PostEditPayload.build(PostEditField.ALL, full)).isEqualTo(full)
    }

    @Test
    fun `a known field the draft does not hold stays absent`() {
        assertThat(PostEditPayload.build(PostEditField.ALL, PostEditDraft(content = "x")).mentions).isNull()
    }

    @Test
    fun `every draft field has a matching edit field`() {
        assertThat(PostEditField.entries).hasSize(14)
    }

    private val reel = listOf(ReelComposition.MediaKind("video/mp4", 5000))
    private val image = listOf(ReelComposition.MediaKind("image/png"))

    @Test
    fun `reel is choosable when remaining media qualify`() {
        assertThat(PostEditTypeChoice.reelIsChoosable("POST", reel, removedAny = true))
            .isEqualTo(ReelChoosability.RemainingQualifies)
    }

    @Test
    fun `an untouched original reel stays choosable even without known durations`() {
        val verdict = PostEditTypeChoice.reelIsChoosable("reel", image, removedAny = false)
        assertThat(verdict).isEqualTo(ReelChoosability.OriginalReelUntouched)
        assertThat(verdict.isChoosable).isTrue()
    }

    @Test
    fun `a removal that disqualifies is refused with its reason`() {
        val verdict = PostEditTypeChoice.reelIsChoosable("REEL", image, removedAny = true)
        assertThat(verdict).isEqualTo(ReelChoosability.RefusedAfterRemoval)
        assertThat(PostEditTypeChoice.selection("REEL", verdict)).isEqualTo("POST")
    }

    @Test
    fun `a post with non qualifying media gets the not qualifying verdict`() {
        val verdict = PostEditTypeChoice.reelIsChoosable(null, image, removedAny = false)
        assertThat(verdict).isEqualTo(ReelChoosability.RefusedNotQualifying)
        assertThat(PostEditTypeChoice.selection("POST", verdict)).isEqualTo("POST")
    }
}
