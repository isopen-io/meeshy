package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VideoTranscodePlanTest {

    private fun source(
        codec: VideoSourceCodec = VideoSourceCodec.H264,
        width: Int = 720,
        height: Int = 1280,
        bitRate: Long? = 2_000_000,
        frameRate: Float? = 30f,
    ) = VideoSourceInfo(codec, width, height, bitRate, frameRate)

    private fun plan(
        source: VideoSourceInfo,
        context: ImageUploadContext = ImageUploadContext.MESSAGE,
        hardwareHevc: Boolean = true,
    ) = VideoTranscodePlanner.plan(source, VideoBudget.forContext(context), hardwareHevc)

    @Test
    fun `les budgets par contexte suivent iOS`() {
        val message = VideoBudget.forContext(ImageUploadContext.MESSAGE)
        assertThat(message.videoBitRate).isEqualTo(2_500_000)
        assertThat(message.maxWidth).isEqualTo(720)
        assertThat(message.maxHeight).isEqualTo(1280)
        assertThat(message.audioBitRate).isEqualTo(96_000)

        val story = VideoBudget.forContext(ImageUploadContext.STORY)
        assertThat(story.videoBitRate).isEqualTo(4_000_000)
        assertThat(story.maxHeight).isEqualTo(1920)
        assertThat(story.audioBitRate).isEqualTo(128_000)

        val feed = VideoBudget.forContext(ImageUploadContext.FEED_POST)
        assertThat(feed.videoBitRate).isEqualTo(4_000_000)
        assertThat(feed.maxWidth).isEqualTo(1080)
        assertThat(feed.audioBitRate).isEqualTo(96_000)

        val avatar = VideoBudget.forContext(ImageUploadContext.AVATAR)
        assertThat(avatar.videoBitRate).isEqualTo(1_000_000)
        assertThat(avatar.maxWidth).isEqualTo(480)
        assertThat(avatar.maxHeight).isEqualTo(480)

        val full = VideoBudget.forContext(ImageUploadContext.FULLSCREEN)
        assertThat(full.videoBitRate).isEqualTo(8_000_000)
        assertThat(full.maxWidth).isEqualTo(1920)
        assertThat(full.maxHeight).isEqualTo(1080)
        assertThat(full.audioBitRate).isEqualTo(128_000)
    }

    @Test
    fun `h264 dans le budget est remuxé`() {
        assertThat(plan(source())).isEqualTo(VideoTranscodePlan.Passthrough)
    }

    @Test
    fun `hevc dans le budget avec un débit jusqu'à deux fois le budget est remuxé`() {
        val atTwice = source(codec = VideoSourceCodec.HEVC, bitRate = 5_000_000)
        assertThat(plan(atTwice)).isEqualTo(VideoTranscodePlan.Passthrough)
    }

    @Test
    fun `un débit au dessus de deux fois le budget force le ré encodage`() {
        val result = plan(source(bitRate = 5_000_001))
        assertThat(result).isInstanceOf(VideoTranscodePlan.Transcode::class.java)
    }

    @Test
    fun `une résolution au dessus du budget force le ré encodage`() {
        val result = plan(source(width = 1080, height = 1920)) as VideoTranscodePlan.Transcode
        assertThat(result.width).isEqualTo(720)
        assertThat(result.height).isEqualTo(1280)
    }

    @Test
    fun `un codec hors h264 hevc force le ré encodage`() {
        assertThat(plan(source(codec = VideoSourceCodec.OTHER)))
            .isInstanceOf(VideoTranscodePlan.Transcode::class.java)
    }

    @Test
    fun `le ré encodage choisit hevc avec un décodeur matériel sinon h264`() {
        val heavy = source(bitRate = 20_000_000)
        assertThat((plan(heavy, hardwareHevc = true) as VideoTranscodePlan.Transcode).codec)
            .isEqualTo(VideoTargetCodec.HEVC)
        assertThat((plan(heavy, hardwareHevc = false) as VideoTranscodePlan.Transcode).codec)
            .isEqualTo(VideoTargetCodec.H264)
    }

    @Test
    fun `le ré encodage plafonne à trente images par seconde et porte les débits du budget`() {
        val result = plan(
            source(bitRate = 20_000_000, frameRate = 60f),
            context = ImageUploadContext.STORY,
        ) as VideoTranscodePlan.Transcode
        assertThat(result.frameRate).isEqualTo(30)
        assertThat(result.videoBitRate).isEqualTo(4_000_000)
        assertThat(result.audioBitRate).isEqualTo(128_000)
    }

    @Test
    fun `une cadence inconnue ou plus basse est conservée`() {
        val low = plan(source(bitRate = 20_000_000, frameRate = 24f)) as VideoTranscodePlan.Transcode
        assertThat(low.frameRate).isEqualTo(24)
        val unknown = plan(source(bitRate = 20_000_000, frameRate = null)) as VideoTranscodePlan.Transcode
        assertThat(unknown.frameRate).isEqualTo(30)
    }

    @Test
    fun `les dimensions cibles sont paires et gardent le ratio`() {
        val result = plan(
            source(width = 1921, height = 1081, bitRate = 20_000_000),
            context = ImageUploadContext.FULLSCREEN,
        ) as VideoTranscodePlan.Transcode
        assertThat(result.width % 2).isEqualTo(0)
        assertThat(result.height % 2).isEqualTo(0)
        assertThat(result.width).isAtMost(1920)
        assertThat(result.height).isAtMost(1080)
    }

    @Test
    fun `un débit inconnu est tenu pour dans le budget comme sur iOS`() {
        assertThat(plan(source(bitRate = null))).isEqualTo(VideoTranscodePlan.Passthrough)
    }

    @Test
    fun `la tolérance d'un pixel sur la résolution est conservée`() {
        assertThat(plan(source(width = 721, height = 1281))).isEqualTo(VideoTranscodePlan.Passthrough)
    }
}
