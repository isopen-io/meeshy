package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ReelOfferTest {
    private fun video(durationMs: Long? = 5000L) = listOf(ReelComposition.MediaKind("video/mp4", durationMs))

    private fun offers(
        type: PostType = PostType.POST,
        media: List<ReelComposition.MediaKind> = video(),
        isRepost: Boolean = false,
        isEdit: Boolean = false,
        chosen: Boolean = false,
    ) = ReelOffer.offersReelForPost(type, media, isRepost, isEdit, chosen)

    @Test
    fun `a plain post of one qualifying video is offered the reel`() {
        assertThat(offers()).isTrue()
    }

    @Test
    fun `a repost is never offered`() = assertThat(offers(isRepost = true)).isFalse()

    @Test
    fun `an edit is never offered`() = assertThat(offers(isEdit = true)).isFalse()

    @Test
    fun `an author who already chose a format is not asked again`() = assertThat(offers(chosen = true)).isFalse()

    @Test
    fun `only a POST is offered`() {
        assertThat(offers(type = PostType.REEL)).isFalse()
        assertThat(offers(type = PostType.STORY)).isFalse()
    }

    @Test
    fun `an unknown or short duration does not qualify`() {
        assertThat(offers(media = video(null))).isFalse()
        assertThat(offers(media = video(2999))).isFalse()
        assertThat(offers(media = video(3000))).isTrue()
    }

    @Test
    fun `several media or a non video media are not offered`() {
        assertThat(offers(media = video() + video())).isFalse()
        assertThat(offers(media = listOf(ReelComposition.MediaKind("audio/mp4", 9000)))).isFalse()
        assertThat(offers(media = emptyList())).isFalse()
    }

    @Test
    fun `forcePlainPost is honored by the default type`() {
        assertThat(ReelComposition.defaultType(video(), forcePlainPost = true)).isEqualTo(PostType.POST)
    }
}
