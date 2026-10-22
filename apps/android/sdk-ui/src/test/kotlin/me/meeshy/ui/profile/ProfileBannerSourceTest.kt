package me.meeshy.ui.profile

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ProfileBannerSourceTest {

    @Test
    fun `the photo always wins over a design`() {
        val paint = ProfileBannerPaint.resolve(photoUrl = "https://x/b.jpg", designKey = "aurora")
        assertThat(paint).isEqualTo(ProfileBannerPaint.Photo("https://x/b.jpg"))
    }

    @Test
    fun `without photo the equipped design is painted`() {
        assertThat(ProfileBannerPaint.resolve(photoUrl = null, designKey = "aurora"))
            .isEqualTo(ProfileBannerPaint.Design("aurora"))
        assertThat(ProfileBannerPaint.resolve(photoUrl = "  ", designKey = "aurora"))
            .isEqualTo(ProfileBannerPaint.Design("aurora"))
    }

    @Test
    fun `without photo nor design the accent gradient is painted`() {
        assertThat(ProfileBannerPaint.resolve(photoUrl = null, designKey = null)).isEqualTo(ProfileBannerPaint.Plain)
        assertThat(ProfileBannerPaint.resolve(photoUrl = "", designKey = "")).isEqualTo(ProfileBannerPaint.Plain)
    }

    @Test
    fun `blocked by the target drops the design`() {
        assertThat(ProfileBannerPaint.resolve(photoUrl = null, designKey = "aurora", isBlockedByTarget = true))
            .isEqualTo(ProfileBannerPaint.Plain)
    }

    @Test
    fun `a failed photo load degrades silently to the gradient`() {
        val paint = ProfileBannerPaint.resolve(photoUrl = "https://x/b.jpg", designKey = null, photoFailed = true)
        assertThat(paint).isEqualTo(ProfileBannerPaint.Plain)
    }

    @Test
    fun `only a photo opens fullscreen`() {
        assertThat(ProfileBannerPaint.Photo("u").opensFullscreen).isTrue()
        assertThat(ProfileBannerPaint.Plain.opensFullscreen).isFalse()
        assertThat(ProfileBannerPaint.Design("a").opensFullscreen).isFalse()
    }

    @Test
    fun `fullscreen opens only with a non blank url`() {
        assertThat(ProfileFullscreenImage.opening(null, "Ada")).isNull()
        assertThat(ProfileFullscreenImage.opening("  ", "Ada")).isNull()
        assertThat(ProfileFullscreenImage.opening("https://x/a.jpg", "Ada"))
            .isEqualTo(ProfileFullscreenImage("https://x/a.jpg", "Ada"))
    }
}
