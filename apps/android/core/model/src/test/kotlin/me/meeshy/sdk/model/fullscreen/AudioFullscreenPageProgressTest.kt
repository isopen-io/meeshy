package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyMediaConsumption
import me.meeshy.sdk.model.playback.AudioPlaybackState
import org.junit.Test

class AudioFullscreenPageProgressTest {

    private fun engineOn(id: String?, currentMs: Long = 0L, durationMs: Long = 0L) =
        AudioPlaybackState(attachmentId = id, isPlaying = id != null, currentTimeMs = currentMs, durationMs = durationMs)

    @Test
    fun `la page que le moteur joue suit le moteur`() {
        val fraction = AudioFullscreenPageProgress.fraction(
            pageAttachmentId = "a",
            engine = engineOn("a", currentMs = 2_500L, durationMs = 10_000L),
            localPositionMs = 9_000L,
            served = null,
            declaredDurationMs = 10_000L,
        )

        assertThat(fraction).isWithin(1e-9).of(0.25)
    }

    @Test
    fun `une page que le moteur ne joue pas garde sa position memorisee`() {
        val fraction = AudioFullscreenPageProgress.fraction(
            pageAttachmentId = "b",
            engine = engineOn("a", currentMs = 2_500L, durationMs = 10_000L),
            localPositionMs = 4_000L,
            served = MeeshyMediaConsumption(listenedComplete = true),
            declaredDurationMs = 10_000L,
        )

        assertThat(fraction).isWithin(1e-9).of(0.4)
    }

    @Test
    fun `sans position locale la consommation servie amorce la page`() {
        val complete = AudioFullscreenPageProgress.fraction(
            pageAttachmentId = "b",
            engine = engineOn(null),
            localPositionMs = null,
            served = MeeshyMediaConsumption(listenedComplete = true),
            declaredDurationMs = 10_000L,
        )
        val halfway = AudioFullscreenPageProgress.fraction(
            pageAttachmentId = "b",
            engine = engineOn(null),
            localPositionMs = null,
            served = MeeshyMediaConsumption(lastPlayPositionMs = 5_000),
            declaredDurationMs = 10_000L,
        )

        assertThat(complete).isWithin(1e-9).of(1.0)
        assertThat(halfway).isWithin(1e-9).of(0.5)
    }

    @Test
    fun `la page en chargement garde sa position au repos tant que la duree est inconnue`() {
        val fraction = AudioFullscreenPageProgress.fraction(
            pageAttachmentId = "a",
            engine = AudioPlaybackState(attachmentId = "a", isLoading = true),
            localPositionMs = 3_000L,
            served = null,
            declaredDurationMs = 10_000L,
        )

        assertThat(fraction).isWithin(1e-9).of(0.3)
    }

    @Test
    fun `une duree inconnue ne fabrique aucune position`() {
        val fraction = AudioFullscreenPageProgress.fraction(
            pageAttachmentId = "b",
            engine = engineOn(null),
            localPositionMs = 3_000L,
            served = null,
            declaredDurationMs = 0L,
        )

        assertThat(fraction).isWithin(1e-9).of(0.0)
    }
}
