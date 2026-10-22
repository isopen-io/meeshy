package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.playback.MediaBackgroundPolicy.VideoVerdict
import org.junit.Test

/**
 * Port de `MediaBackgroundPolicyTests` (iOS, #11041) : l'audio survit a l'arriere-plan en lecture
 * comme en pause, la video ne survit jamais hors de la fenetre PiP.
 */
class MediaBackgroundPolicyTest {

    private fun decide(
        audioQueuePlaying: Boolean = false,
        audioQueueActive: Boolean = false,
        anyAudioEnginePlaying: Boolean = false,
        video: VideoVerdict = VideoVerdict.None,
    ) = MediaBackgroundPolicy.decide(
        audioQueuePlaying = audioQueuePlaying,
        audioQueueActive = audioQueueActive,
        anyAudioEnginePlaying = anyAudioEnginePlaying,
        video = video,
    )

    private fun videoVerdict(
        videoPlaying: Boolean = false,
        pipConfigured: Boolean = false,
        pipStartingOrEngaged: Boolean = false,
        pipFailed: Boolean = false,
    ) = MediaBackgroundPolicy.backgroundVideo(
        videoPlaying = videoPlaying,
        pipConfigured = pipConfigured,
        pipStartingOrEngaged = pipStartingOrEngaged,
        pipFailed = pipFailed,
    )

    // MARK: - Video : PiP ou pause

    @Test
    fun `une video en lecture dont le PiP demarre lui est confiee`() {
        assertThat(videoVerdict(videoPlaying = true, pipConfigured = true, pipStartingOrEngaged = true))
            .isEqualTo(VideoVerdict.HandOffToPip)
    }

    @Test
    fun `une video en lecture avec un PiP configure mais jamais demarre se met en pause`() {
        assertThat(videoVerdict(videoPlaying = true, pipConfigured = true)).isEqualTo(VideoVerdict.Pause)
    }

    @Test
    fun `une video sans PiP ne continue jamais de jouer en arriere-plan`() {
        assertThat(videoVerdict(videoPlaying = true)).isEqualTo(VideoVerdict.Pause)
    }

    @Test
    fun `une fenetre PiP qui echoue a s'ouvrir laisse la video sans lieu et elle s'arrete`() {
        assertThat(
            videoVerdict(videoPlaying = true, pipConfigured = true, pipStartingOrEngaged = true, pipFailed = true),
        ).isEqualTo(VideoVerdict.Pause)
    }

    @Test
    fun `une video en pause dans un PiP ouvert garde sa fenetre`() {
        assertThat(videoVerdict(pipConfigured = true, pipStartingOrEngaged = true))
            .isEqualTo(VideoVerdict.HandOffToPip)
    }

    @Test
    fun `rien ne joue et aucune fenetre n'est ouverte`() {
        assertThat(videoVerdict()).isEqualTo(VideoVerdict.None)
        assertThat(videoVerdict(pipConfigured = true)).isEqualTo(VideoVerdict.None)
        assertThat(videoVerdict(pipConfigured = true, pipFailed = true)).isEqualTo(VideoVerdict.None)
    }

    @Test
    fun `la video ne survit jamais hors PiP quelle que soit la combinaison`() {
        val booleans = listOf(false, true)
        for (playing in booleans) for (configured in booleans) for (engaged in booleans) for (failed in booleans) {
            val verdict = videoVerdict(playing, configured, engaged, failed)
            val outsidePip = !(configured && engaged) || failed

            if (outsidePip && playing) assertThat(verdict).isEqualTo(VideoVerdict.Pause)
            if (verdict == VideoVerdict.HandOffToPip) assertThat(outsidePip).isFalse()
        }
    }

    // MARK: - Decision d'ensemble

    @Test
    fun `confier la video au PiP ne la met pas en pause et garde la session vivante`() {
        val decision = decide(video = VideoVerdict.HandOffToPip)

        assertThat(decision.pausesVideo).isFalse()
        assertThat(decision.keepsSessionAlive).isTrue()
    }

    @Test
    fun `une video mise en pause sans audio vivant laisse la session se rendre`() {
        val decision = decide(video = VideoVerdict.Pause)

        assertThat(decision.pausesVideo).isTrue()
        assertThat(decision.keepsSessionAlive).isFalse()
    }

    @Test
    fun `une file audio en lecture garde la session vivante`() {
        val decision = decide(audioQueuePlaying = true)

        assertThat(decision.pausesVideo).isFalse()
        assertThat(decision.keepsSessionAlive).isTrue()
    }

    @Test
    fun `une file audio en pause garde elle aussi la session vivante`() {
        assertThat(decide(audioQueueActive = true).keepsSessionAlive).isTrue()
    }

    @Test
    fun `un moteur audio isole en lecture garde la session vivante`() {
        assertThat(decide(anyAudioEnginePlaying = true).keepsSessionAlive).isTrue()
    }

    @Test
    fun `une video mise en pause pendant qu'une file audio est active garde la session`() {
        val decision = decide(audioQueueActive = true, video = VideoVerdict.Pause)

        assertThat(decision.pausesVideo).isTrue()
        assertThat(decision.keepsSessionAlive).isTrue()
    }

    @Test
    fun `quand tout est au repos la session est demontee`() {
        val decision = decide()

        assertThat(decision.pausesVideo).isFalse()
        assertThat(decision.keepsSessionAlive).isFalse()
    }
}
