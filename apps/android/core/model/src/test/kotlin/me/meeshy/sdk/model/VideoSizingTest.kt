package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Hauteur d'une vidéo en bulle — miroir de `MessageAttachment+VideoSizing.swift`.
 * La bulle réserve la place AVANT le premier octet : hauteur = largeur × ratio
 * h/w, plafonnée à 1,6 × la largeur (portrait 5:8 au plus), repli 16:9.
 */
class VideoSizingTest {

    private fun video(width: Int?, height: Int?) =
        ApiMessageAttachment(id = "v1", mimeType = "video/mp4", width = width, height = height)

    @Test
    fun `a landscape 16 by 9 video is as tall as nine sixteenths of its width`() {
        assertThat(video(1920, 1080).videoHeight(forWidth = 320f)).isWithin(0.001f).of(180f)
    }

    @Test
    fun `a square video is as tall as it is wide`() {
        assertThat(video(1000, 1000).videoHeight(forWidth = 200f)).isWithin(0.001f).of(200f)
    }

    @Test
    fun `a tall portrait video is capped at one point six times its width`() {
        assertThat(video(1080, 1920).videoHeight(forWidth = 200f)).isWithin(0.001f).of(320f)
    }

    @Test
    fun `a portrait 5 by 8 video sits exactly on the cap`() {
        assertThat(video(800, 1280).videoHeight(forWidth = 200f)).isWithin(0.001f).of(320f)
    }

    @Test
    fun `a portrait video under the cap keeps its true ratio`() {
        assertThat(video(1000, 1250).videoHeight(forWidth = 200f)).isWithin(0.001f).of(250f)
    }

    @Test
    fun `unknown dimensions fall back to 16 by 9`() {
        assertThat(video(null, null).videoHeight(forWidth = 320f)).isWithin(0.001f).of(180f)
        assertThat(video(1920, null).videoHeight(forWidth = 320f)).isWithin(0.001f).of(180f)
        assertThat(video(null, 1080).videoHeight(forWidth = 320f)).isWithin(0.001f).of(180f)
    }

    @Test
    fun `zero or negative dimensions are unknown dimensions`() {
        assertThat(video(0, 1080).videoHeight(forWidth = 320f)).isWithin(0.001f).of(180f)
        assertThat(video(1920, 0).videoHeight(forWidth = 320f)).isWithin(0.001f).of(180f)
        assertThat(video(-1920, -1080).videoHeight(forWidth = 320f)).isWithin(0.001f).of(180f)
    }

    @Test
    fun `the cap is a parameter`() {
        assertThat(video(1080, 1920).videoHeight(forWidth = 200f, maxRatio = 1.2f))
            .isWithin(0.001f).of(240f)
    }

    @Test
    fun `the aspect ratio is null until both dimensions are positive`() {
        assertThat(video(1920, 1080).videoAspectRatio).isWithin(0.0001).of(16.0 / 9.0)
        assertThat(video(1920, null).videoAspectRatio).isNull()
        assertThat(video(0, 1080).videoAspectRatio).isNull()
    }

    @Test
    fun `the domain attachment sizes a video the same way`() {
        val attachment = MeeshyMessageAttachment(id = "v1", mimeType = "video/mp4", width = 1080, height = 1920)
        assertThat(attachment.videoHeight(forWidth = 200f)).isWithin(0.001f).of(320f)
        assertThat(MeeshyMessageAttachment(id = "v2").videoHeight(forWidth = 320f))
            .isWithin(0.001f).of(180f)
    }

    @Test
    fun `the height is always positive for a positive width`() {
        listOf(
            video(1, 100000), video(100000, 1), video(null, null), video(3, 4),
        ).forEach { assertThat(it.videoHeight(forWidth = 1f)).isGreaterThan(0f) }
    }
}
