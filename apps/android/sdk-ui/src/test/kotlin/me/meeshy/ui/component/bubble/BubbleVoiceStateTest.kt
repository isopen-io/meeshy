package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.AudioAvailability
import me.meeshy.sdk.model.media.MediaAvailabilityState
import me.meeshy.sdk.model.media.PlaybackSpeed
import org.junit.Test

/** Le portrait du lecteur d'une bulle : la pièce active lit le moteur partagé, toute autre son repos servi. */
class BubbleVoiceStateTest {

    private fun audio(
        id: String = "a1",
        seconds: Int? = 12,
        position: Int? = null,
        complete: Boolean = false,
    ) = BubbleAudio(
        attachmentId = id,
        url = "https://cdn/$id.m4a",
        durationSeconds = seconds,
        sizeBytes = 48_000,
        lastPlayPositionMs = position,
        listenedComplete = complete,
    )

    private fun playing(id: String = "a1") = BubbleAudioPlayback(
        attachmentId = id,
        isPlaying = true,
        isLoading = false,
        progress = 0.25f,
        timeLabel = "0:03 / 0:12",
        currentSeconds = 3.0,
        speed = PlaybackSpeed.X1_5,
        durationSeconds = 12.4,
    )

    @Test
    fun `la piece active montre la progression, l'ecoule, la duree et la vitesse du moteur`() {
        val state = bubbleVoiceState(audio(), playing(), MediaAvailabilityState.Ready, emptyList())

        assertThat(state.isPlaying).isTrue()
        assertThat(state.liveFraction).isWithin(1e-6).of(0.25)
        assertThat(state.liveElapsedSeconds).isEqualTo(3.0)
        assertThat(state.durationSeconds).isEqualTo(12.4)
        assertThat(state.speed).isEqualTo(PlaybackSpeed.X1_5)
    }

    @Test
    fun `une autre piece active laisse la bulle a son repos servi`() {
        val state = bubbleVoiceState(audio(position = 6_000), playing("other"), MediaAvailabilityState.Ready, emptyList())

        assertThat(state.isPlaying).isFalse()
        assertThat(state.liveFraction).isEqualTo(0.0)
        assertThat(state.restingFraction).isEqualTo(0.5)
        assertThat(state.resumePositionSeconds).isEqualTo(6.0)
        assertThat(state.durationSeconds).isEqualTo(12.0)
        assertThat(state.speed).isEqualTo(PlaybackSpeed.DEFAULT)
    }

    @Test
    fun `un vocal ecoute jusqu'au bout repose plein`() {
        val state = bubbleVoiceState(audio(position = 6_000, complete = true), null, MediaAvailabilityState.Ready, emptyList())

        assertThat(state.restingFraction).isEqualTo(1.0)
        assertThat(state.resumePositionSeconds).isNull()
    }

    @Test
    fun `une duree inconnue du moteur et de la piece reste nulle`() {
        val state = bubbleVoiceState(audio(seconds = null), playing().copy(durationSeconds = 0.0), MediaAvailabilityState.Ready, emptyList())

        assertThat(state.durationSeconds).isEqualTo(0.0)
        assertThat(audio(seconds = null).declaredDurationMs).isEqualTo(0L)
        assertThat(audio(seconds = -3).declaredDurationMs).isEqualTo(0L)
    }

    @Test
    fun `un vocal a telecharger montre sa taille, la forme d'onde servie passe telle quelle`() {
        val samples = listOf(0.1f, 0.9f)
        val state = bubbleVoiceState(audio(), null, MediaAvailabilityState.NeedsDownload(sizeBytes = 48_000), samples)

        assertThat(state.availability).isEqualTo(AudioAvailability.NeedsDownload)
        assertThat(state.fileSizeBytes).isEqualTo(48_000L)
        assertThat(state.samples).isEqualTo(samples)
    }

    @Test
    fun `sans forme d'onde servie, le lecteur garde son repli`() {
        assertThat(bubbleVoiceState(audio(), null, MediaAvailabilityState.Ready, emptyList()).samples).isEmpty()
    }
}
