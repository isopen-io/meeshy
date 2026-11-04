package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.AudioAvailability
import me.meeshy.sdk.model.media.MediaAvailabilityState
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

    private val acknowledged: (String) -> String? = { if (it == "cmid_voice") "att_server" else null }

    @Test
    fun `la bulle accusee montre le vocal en cours sous son id serveur, au meme point`() {
        val live = BubbleVoiceProjection.live(engine(id = "cmid_voice", positionMs = 5_000), listOf("att_server"), acknowledged)

        assertThat(live?.attachmentId).isEqualTo("att_server")
        assertThat(live?.isPlaying).isTrue()
        assertThat(live?.elapsedSeconds).isEqualTo(5.0)
    }

    @Test
    fun `un autre vocal n'est jamais pris pour la jumelle accusee`() {
        assertThat(BubbleVoiceProjection.live(engine(id = "cmid_voice"), listOf("att_other"), acknowledged)).isNull()
        assertThat(BubbleVoiceProjection.live(engine(id = "cmid_other"), listOf("att_server"), acknowledged)).isNull()
    }

    @Test
    fun `toucher la jumelle accusee du vocal en cours le met en pause au lieu de le relancer`() {
        assertThat(VoiceTap.step("cmid_voice", "att_server", "https://gate.meeshy.me/voice.m4a", acknowledged))
            .isEqualTo(VoiceTap.Step.TOGGLE)
        assertThat(VoiceTap.step("cmid_voice", "att_other", "https://gate.meeshy.me/other.m4a", acknowledged))
            .isEqualTo(VoiceTap.Step.START_QUEUE)
    }

    @Test
    fun `une piece sans adresse est refusee, meme active`() {
        assertThat(VoiceTap.step(activeAttachmentId = null, tappedAttachmentId = "A", url = null)).isEqualTo(VoiceTap.Step.REFUSE)
        assertThat(VoiceTap.step(activeAttachmentId = "A", tappedAttachmentId = "A", url = "  ")).isEqualTo(VoiceTap.Step.REFUSE)
    }
}

class BubbleVoiceAvailabilityTest {

    @Test
    fun `une piece sur l'appareil se joue tout de suite`() {
        assertThat(BubbleVoiceProjection.availability(MediaAvailabilityState.Ready)).isEqualTo(AudioAvailability.Ready)
    }

    @Test
    fun `une piece a telecharger montre sa taille, hors ligne comme en ligne`() {
        assertThat(BubbleVoiceProjection.availability(MediaAvailabilityState.NeedsDownload(sizeBytes = 850_000, offline = true)))
            .isEqualTo(AudioAvailability.NeedsDownload)
    }

    @Test
    fun `un telechargement en cours devient l'anneau avec ses octets`() {
        assertThat(BubbleVoiceProjection.availability(MediaAvailabilityState.Downloading(downloadedBytes = 410, totalBytes = 820)))
            .isEqualTo(AudioAvailability.Downloading(progress = 0.5, downloadedBytes = 410, totalBytes = 820))
    }

    @Test
    fun `un echec redevient un telechargement a relancer`() {
        assertThat(BubbleVoiceProjection.availability(MediaAvailabilityState.Failed())).isEqualTo(AudioAvailability.NeedsDownload)
    }

    @Test
    fun `seule une piece a telecharger hors ligne est desactivee`() {
        assertThat(BubbleVoiceProjection.isOfflineBlocked(MediaAvailabilityState.NeedsDownload(offline = true))).isTrue()
        assertThat(BubbleVoiceProjection.isOfflineBlocked(MediaAvailabilityState.NeedsDownload(offline = false))).isFalse()
        assertThat(BubbleVoiceProjection.isOfflineBlocked(MediaAvailabilityState.Ready)).isFalse()
    }

    @Test
    fun `la forme d'onde ne se mesure que sur un vocal deja sur l'appareil, jamais en devancant la politique de telechargement`() {
        assertThat(BubbleVoiceProjection.measuresWaveform(MediaAvailabilityState.Ready, isProtected = false)).isTrue()
        assertThat(BubbleVoiceProjection.measuresWaveform(MediaAvailabilityState.NeedsDownload(sizeBytes = 850_000), isProtected = false)).isFalse()
        assertThat(BubbleVoiceProjection.measuresWaveform(MediaAvailabilityState.Downloading(410, 820), isProtected = false)).isFalse()
        assertThat(BubbleVoiceProjection.measuresWaveform(MediaAvailabilityState.Failed(), isProtected = false)).isFalse()
    }

    @Test
    fun `un vocal protege ne se mesure jamais, meme deja sur l'appareil`() {
        assertThat(BubbleVoiceProjection.measuresWaveform(MediaAvailabilityState.Ready, isProtected = true)).isFalse()
    }
}
