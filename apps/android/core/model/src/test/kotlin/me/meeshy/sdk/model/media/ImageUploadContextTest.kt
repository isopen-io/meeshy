package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ImageUploadTarget
import org.junit.Test

/**
 * Behavioural coverage of the [ImageUploadContext] ↔ [ImageUploadTarget] bridge, the
 * single place that maps the shipped avatar/banner upload target onto a compression
 * context so both slices share one source of truth for the per-surface ceiling.
 */
class ImageUploadContextTest {

    @Test
    fun mapsTheAvatarUploadTargetToTheAvatarContext() {
        assertThat(ImageUploadContext.forUploadTarget(ImageUploadTarget.AVATAR))
            .isEqualTo(ImageUploadContext.AVATAR)
    }

    @Test
    fun mapsTheBannerUploadTargetToTheBannerContext() {
        assertThat(ImageUploadContext.forUploadTarget(ImageUploadTarget.BANNER))
            .isEqualTo(ImageUploadContext.BANNER)
    }

    @Test
    fun theAvatarCeilingIsTighterThanTheBannerCeiling() {
        assertThat(ImageUploadContext.AVATAR.maxDimensionPx)
            .isLessThan(ImageUploadContext.BANNER.maxDimensionPx)
    }
}
