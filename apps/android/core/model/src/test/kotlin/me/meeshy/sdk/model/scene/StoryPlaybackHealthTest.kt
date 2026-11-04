package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryPlaybackHealthTest {

    private fun progressing(
        status: PrimaryVideoStatus? = PrimaryVideoStatus.PLAYING,
        userPaused: Boolean = false,
        failed: Boolean = false,
        watchdog: Boolean = false,
        audioPending: Boolean = false,
        mediaPending: Boolean = false,
    ) = StoryPlaybackHealth.isProgressing(status, userPaused, failed, watchdog, audioPending, mediaPending)

    @Test
    fun `la vidéo principale qui joue laisse le temps courir`() {
        assertThat(progressing()).isTrue()
    }

    @Test
    fun `le buffering fige le temps`() {
        assertThat(progressing(status = PrimaryVideoStatus.BUFFERING)).isFalse()
    }

    @Test
    fun `une vidéo arrêtée sans pause utilisateur fige le temps`() {
        assertThat(progressing(status = PrimaryVideoStatus.PAUSED)).isFalse()
    }

    @Test
    fun `sans vidéo principale le temps n'est jamais figé par la vidéo`() {
        assertThat(progressing(status = null)).isTrue()
    }

    @Test
    fun `la pause de l'utilisateur n'est pas un gel de la porte`() {
        assertThat(progressing(status = PrimaryVideoStatus.BUFFERING, userPaused = true)).isTrue()
    }

    @Test
    fun `un lecteur en échec rend la main à l'horloge murale`() {
        assertThat(progressing(status = PrimaryVideoStatus.BUFFERING, failed = true)).isTrue()
    }

    @Test
    fun `le garde-fou dépassé libère aussi l'audio et le média visuel en attente`() {
        assertThat(
            progressing(status = PrimaryVideoStatus.BUFFERING, watchdog = true, audioPending = true, mediaPending = true),
        ).isTrue()
    }

    @Test
    fun `un son jamais planifié fige tant que le garde-fou n'a pas expiré`() {
        assertThat(progressing(status = null, audioPending = true)).isFalse()
        assertThat(progressing(status = null, audioPending = true, watchdog = true)).isTrue()
    }

    @Test
    fun `une image finale pas encore posée fige tant que le garde-fou n'a pas expiré`() {
        assertThat(progressing(status = null, mediaPending = true)).isFalse()
    }

    @Test
    fun `le garde-fou expire après cinq secondes d'attente continue`() {
        val watchdog = StoryStallWatchdog()
        assertThat(watchdog.tick(stalled = true, deltaMs = 4_900)).isFalse()
        assertThat(watchdog.tick(stalled = true, deltaMs = 100)).isTrue()
        assertThat(watchdog.tick(stalled = true, deltaMs = 16)).isTrue()
    }

    @Test
    fun `une reprise remet le garde-fou à zéro`() {
        val watchdog = StoryStallWatchdog()
        watchdog.tick(stalled = true, deltaMs = 4_000)
        watchdog.tick(stalled = false, deltaMs = 16)
        assertThat(watchdog.tick(stalled = true, deltaMs = 4_000)).isFalse()
    }
}
