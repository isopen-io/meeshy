package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ImageUploadTarget
import org.junit.Test

/**
 * Behavioural coverage of [ImageCompressionPlanner.plan] — the pure, context-aware
 * decision beneath the app-side Bitmap re-encode (feature-parity §P: "Image/video
 * compression before upload — context-aware quality"). It mirrors iOS
 * `MediaCompressor.compressImage`'s resize decision + `MediaContext.maxImageDimension`
 * ceilings: fit the longest edge within the context ceiling (aspect-ratio preserved),
 * resize only when the source exceeds it, and always carry a clamped JPEG quality.
 */
class ImageCompressionPlannerTest {

    @Test
    fun keepsDimensionsAndSkipsResizeWhenSourceIsSmallerThanTheContextCeiling() {
        val plan = ImageCompressionPlanner.plan(
            context = ImageUploadContext.MESSAGE,
            sourceWidthPx = 800,
            sourceHeightPx = 600,
        )

        assertThat(plan.resizeRequired).isFalse()
        assertThat(plan.targetWidthPx).isEqualTo(800)
        assertThat(plan.targetHeightPx).isEqualTo(600)
    }

    @Test
    fun skipsResizeWhenTheLongestEdgeEqualsTheCeilingExactly() {
        val plan = ImageCompressionPlanner.plan(
            context = ImageUploadContext.AVATAR,
            sourceWidthPx = 512,
            sourceHeightPx = 512,
        )

        assertThat(plan.resizeRequired).isFalse()
        assertThat(plan.targetWidthPx).isEqualTo(512)
        assertThat(plan.targetHeightPx).isEqualTo(512)
    }

    @Test
    fun resizesWhenTheLongestEdgeIsJustOverTheCeiling() {
        val plan = ImageCompressionPlanner.plan(
            context = ImageUploadContext.AVATAR,
            sourceWidthPx = 513,
            sourceHeightPx = 513,
        )

        assertThat(plan.resizeRequired).isTrue()
        assertThat(plan.targetWidthPx).isEqualTo(512)
        assertThat(plan.targetHeightPx).isEqualTo(512)
    }

    @Test
    fun downscalesLandscapeSoTheWidthFitsTheCeilingAndAspectIsPreserved() {
        val plan = ImageCompressionPlanner.plan(
            context = ImageUploadContext.FEED_POST,
            sourceWidthPx = 3200,
            sourceHeightPx = 1600,
        )

        assertThat(plan.resizeRequired).isTrue()
        assertThat(plan.targetWidthPx).isEqualTo(1600)
        assertThat(plan.targetHeightPx).isEqualTo(800)
    }

    @Test
    fun downscalesPortraitSoTheHeightFitsTheCeiling() {
        val plan = ImageCompressionPlanner.plan(
            context = ImageUploadContext.STORY,
            sourceWidthPx = 2160,
            sourceHeightPx = 4320,
        )

        assertThat(plan.resizeRequired).isTrue()
        assertThat(plan.targetWidthPx).isEqualTo(540)
        assertThat(plan.targetHeightPx).isEqualTo(1080)
    }

    @Test
    fun theSameSourceYieldsDifferentPlansPerContextCeiling() {
        val message = ImageCompressionPlanner.plan(ImageUploadContext.MESSAGE, 2000, 2000)
        val fullscreen = ImageCompressionPlanner.plan(ImageUploadContext.FULLSCREEN, 2000, 2000)

        assertThat(message.resizeRequired).isTrue()
        assertThat(message.targetWidthPx).isEqualTo(1200)
        assertThat(fullscreen.resizeRequired).isFalse()
        assertThat(fullscreen.targetWidthPx).isEqualTo(2000)
    }

    @Test
    fun defaultsToQuality80() {
        val plan = ImageCompressionPlanner.plan(ImageUploadContext.MESSAGE, 100, 100)

        assertThat(plan.quality).isEqualTo(80)
    }

    @Test
    fun passesAnInRangeQualityThrough() {
        val plan = ImageCompressionPlanner.plan(ImageUploadContext.MESSAGE, 100, 100, quality = 50)

        assertThat(plan.quality).isEqualTo(50)
    }

    @Test
    fun clampsAnOverMaxQualityTo100() {
        val plan = ImageCompressionPlanner.plan(ImageUploadContext.MESSAGE, 100, 100, quality = 150)

        assertThat(plan.quality).isEqualTo(100)
    }

    @Test
    fun clampsZeroAndNegativeQualityToTheMinimumOf1() {
        val zero = ImageCompressionPlanner.plan(ImageUploadContext.MESSAGE, 100, 100, quality = 0)
        val negative = ImageCompressionPlanner.plan(ImageUploadContext.MESSAGE, 100, 100, quality = -5)

        assertThat(zero.quality).isEqualTo(1)
        assertThat(negative.quality).isEqualTo(1)
    }

    @Test
    fun treatsAZeroWidthSourceAsANoOpPlan() {
        val plan = ImageCompressionPlanner.plan(ImageUploadContext.MESSAGE, 0, 600)

        assertThat(plan.resizeRequired).isFalse()
        assertThat(plan.targetWidthPx).isEqualTo(0)
        assertThat(plan.targetHeightPx).isEqualTo(600)
    }

    @Test
    fun treatsAZeroHeightSourceAsANoOpPlan() {
        val plan = ImageCompressionPlanner.plan(ImageUploadContext.MESSAGE, 800, 0)

        assertThat(plan.resizeRequired).isFalse()
        assertThat(plan.targetWidthPx).isEqualTo(800)
        assertThat(plan.targetHeightPx).isEqualTo(0)
    }

    @Test
    fun treatsANegativeDimensionAsANoOpPlanButStillClampsQuality() {
        val plan = ImageCompressionPlanner.plan(ImageUploadContext.MESSAGE, -10, 600, quality = 999)

        assertThat(plan.resizeRequired).isFalse()
        assertThat(plan.quality).isEqualTo(100)
    }

    @Test
    fun clampsADegenerateThinPortraitTargetWidthToAtLeast1() {
        val plan = ImageCompressionPlanner.plan(ImageUploadContext.MESSAGE, 2, 3000)

        assertThat(plan.resizeRequired).isTrue()
        assertThat(plan.targetHeightPx).isEqualTo(1200)
        assertThat(plan.targetWidthPx).isEqualTo(1)
    }

    @Test
    fun clampsADegenerateThinLandscapeTargetHeightToAtLeast1() {
        val plan = ImageCompressionPlanner.plan(ImageUploadContext.MESSAGE, 3000, 2)

        assertThat(plan.resizeRequired).isTrue()
        assertThat(plan.targetWidthPx).isEqualTo(1200)
        assertThat(plan.targetHeightPx).isEqualTo(1)
    }

    @Test
    fun preservesAspectRatioWithinRoundingOnAnUnevenDownscale() {
        val plan = ImageCompressionPlanner.plan(ImageUploadContext.MESSAGE, 1000, 3000)

        assertThat(plan.resizeRequired).isTrue()
        assertThat(plan.targetHeightPx).isEqualTo(1200)
        assertThat(plan.targetWidthPx).isEqualTo(400)
    }
}
