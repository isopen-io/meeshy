package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.PlaybackSpeed
import org.junit.Test

class BubbleVoiceProjectionTest {

    private fun engine(
        id: String? = "A",
        positionMs: Long = 3_000,
        durationMs: Long = 12_000,
        isPlaying: Boolean = true,
        isLoading: Boolean = false,
        speed: PlaybackSpeed = PlaybackSpeed.DEFAULT,
    ) = AudioPlaybackState(
        attachmentId = id,
        isPlaying = isPlaying,
        isLoading = isLoading,
        currentTimeMs = positionMs,
        durationMs = durationMs,
        speed = speed,
    )

    @Test
    fun `une bulle dont aucune piece n'est chargee ne recoit aucune projection vivante`() {
        assertThat(BubbleVoiceProjection.live(engine(id = "A"), setOf("B"))).isNull()
    }

    @Test
    fun `un moteur sans piste ne projette rien`() {
        assertThat(BubbleVoiceProjection.live(engine(id = null), setOf("A"))).isNull()
    }

    @Test
    fun `la piece chargee projette sa fraction, son ecoule, sa duree et sa vitesse`() {
        val live = BubbleVoiceProjection.live(engine(speed = PlaybackSpeed.X1_5), setOf("A"))

        assertThat(live).isEqualTo(
            BubbleVoiceLive(
                attachmentId = "A",
                isPlaying = true,
                isLoading = false,
                fraction = 0.25,
                elapsedSeconds = 3.0,
                durationSeconds = 12.0,
                speed = PlaybackSpeed.X1_5,
            ),
        )
    }

    @Test
    fun `une duree moteur inconnue rend une fraction nulle sans diviser par zero`() {
        val live = BubbleVoiceProjection.live(engine(positionMs = 0, durationMs = 0, isLoading = true, isPlaying = false), setOf("A"))

        assertThat(live?.fraction).isEqualTo(0.0)
        assertThat(live?.durationSeconds).isEqualTo(0.0)
        assertThat(live?.isLoading).isTrue()
    }

    @Test
    fun `dans une pile, c'est la piece que le moteur tient qui est projetee`() {
        val live = BubbleVoiceProjection.live(engine(id = "B"), listOf("A", "B"))

        assertThat(live?.attachmentId).isEqualTo("B")
    }

    @Test
    fun `au repos, la fraction et la reprise viennent de la position servie`() {
        assertThat(BubbleVoiceProjection.restingFraction(6_000, listenedComplete = false, durationMs = 12_000)).isEqualTo(0.5)
        assertThat(BubbleVoiceProjection.resumeSeconds(6_000, listenedComplete = false, durationMs = 12_000)).isEqualTo(6.0)
    }

    @Test
    fun `un vocal ecoute jusqu'au bout repose plein et ne reprend nulle part`() {
        assertThat(BubbleVoiceProjection.restingFraction(6_000, listenedComplete = true, durationMs = 12_000)).isEqualTo(1.0)
        assertThat(BubbleVoiceProjection.resumeSeconds(6_000, listenedComplete = true, durationMs = 12_000)).isNull()
    }

    @Test
    fun `une position au-dela de la duree est bornee au plein`() {
        assertThat(BubbleVoiceProjection.restingFraction(20_000, listenedComplete = false, durationMs = 12_000)).isEqualTo(1.0)
    }

    @Test
    fun `sans position servie ou sans duree, le repos est vide et rien ne reprend`() {
        assertThat(BubbleVoiceProjection.restingFraction(null, listenedComplete = false, durationMs = 12_000)).isEqualTo(0.0)
        assertThat(BubbleVoiceProjection.resumeSeconds(null, listenedComplete = false, durationMs = 12_000)).isNull()
        assertThat(BubbleVoiceProjection.restingFraction(6_000, listenedComplete = false, durationMs = 0)).isEqualTo(0.0)
        assertThat(BubbleVoiceProjection.resumeSeconds(0, listenedComplete = false, durationMs = 12_000)).isNull()
    }

    @Test
    fun `toucher la piece active la met en pause ou la reprend`() {
        assertThat(VoiceTap.step(activeAttachmentId = "A", tappedAttachmentId = "A", url = "https://cdn/a.m4a"))
            .isEqualTo(VoiceTap.Step.TOGGLE)
    }

    @Test
    fun `toucher une autre piece demarre la file depuis elle`() {
        assertThat(VoiceTap.step(activeAttachmentId = null, tappedAttachmentId = "A", url = "https://cdn/a.m4a"))
            .isEqualTo(VoiceTap.Step.START_QUEUE)
        assertThat(VoiceTap.step(activeAttachmentId = "A", tappedAttachmentId = "B", url = "file:///b.m4a"))
            .isEqualTo(VoiceTap.Step.START_QUEUE)
    }

    @Test
    fun `une piece sans adresse est refusee, meme active`() {
        assertThat(VoiceTap.step(activeAttachmentId = null, tappedAttachmentId = "A", url = null)).isEqualTo(VoiceTap.Step.REFUSE)
        assertThat(VoiceTap.step(activeAttachmentId = "A", tappedAttachmentId = "A", url = "  ")).isEqualTo(VoiceTap.Step.REFUSE)
    }
}
