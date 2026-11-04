package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.PlaybackSpeed
import org.junit.Test

class AudioPlaybackReducerTest {

    private fun reduce(state: AudioPlaybackState, vararg actions: AudioPlaybackAction): AudioPlaybackState =
        actions.fold(state) { acc, action -> AudioPlaybackReducer.reduce(acc, action) }

    private fun playing(id: String = "a", duration: Long = 10_000L, at: Long = 0L): AudioPlaybackState = reduce(
        AudioPlaybackState(),
        AudioPlaybackAction.LoadRequested(id),
        AudioPlaybackAction.Prepared(duration, at),
    )

    @Test
    fun `demander un vocal bascule l'identifiant et lance le chargement dans la meme transition`() {
        val state = reduce(playing("a", at = 4_000L), AudioPlaybackAction.LoadRequested("b"))

        assertThat(state.attachmentId).isEqualTo("b")
        assertThat(state.isLoading).isTrue()
        assertThat(state.isPlaying).isFalse()
        assertThat(state.currentTimeMs).isEqualTo(0L)
    }

    @Test
    fun `la vitesse choisie survit au changement de piste`() {
        val state = reduce(
            playing("a"),
            AudioPlaybackAction.SpeedSet(PlaybackSpeed.X1_5),
            AudioPlaybackAction.LoadRequested("b"),
        )

        assertThat(state.speed).isEqualTo(PlaybackSpeed.X1_5)
    }

    @Test
    fun `la piste prete joue depuis la reprise et arrete le chargement`() {
        val state = playing(duration = 8_000L, at = 3_000L)

        assertThat(state.isPlaying).isTrue()
        assertThat(state.isLoading).isFalse()
        assertThat(state.durationMs).isEqualTo(8_000L)
        assertThat(state.progress).isWithin(1e-9).of(0.375)
    }

    @Test
    fun `la reprise est bornee a la duree`() {
        assertThat(playing(duration = 5_000L, at = 9_000L).currentTimeMs).isEqualTo(5_000L)
    }

    @Test
    fun `un echantillon de position est ignore hors lecture`() {
        val paused = reduce(playing(), AudioPlaybackAction.Paused)

        assertThat(reduce(paused, AudioPlaybackAction.Tick(5_000L)).currentTimeMs).isEqualTo(0L)
    }

    @Test
    fun `un echantillon de position pendant la lecture est borne`() {
        assertThat(reduce(playing(), AudioPlaybackAction.Tick(99_000L)).currentTimeMs).isEqualTo(10_000L)
        assertThat(reduce(playing(), AudioPlaybackAction.Tick(-5L)).currentTimeMs).isEqualTo(0L)
    }

    @Test
    fun `pause puis reprise`() {
        val paused = reduce(playing(), AudioPlaybackAction.Paused)
        assertThat(paused.isPlaying).isFalse()
        assertThat(reduce(paused, AudioPlaybackAction.Resumed).isPlaying).isTrue()
    }

    @Test
    fun `reprendre sans piste chargee ne fait rien`() {
        assertThat(reduce(AudioPlaybackState(), AudioPlaybackAction.Resumed).isPlaying).isFalse()
    }

    @Test
    fun `chercher par fraction et par saut reste dans la piste`() {
        val state = playing(duration = 10_000L)

        assertThat(reduce(state, AudioPlaybackAction.SeekToFraction(0.5)).currentTimeMs).isEqualTo(5_000L)
        assertThat(reduce(state, AudioPlaybackAction.SeekToFraction(7.0)).currentTimeMs).isEqualTo(10_000L)
        assertThat(reduce(state, AudioPlaybackAction.SeekToFraction(Double.NaN)).currentTimeMs).isEqualTo(0L)
        assertThat(reduce(state, AudioPlaybackAction.SkipBy(-15_000L)).currentTimeMs).isEqualTo(0L)
        assertThat(reduce(state, AudioPlaybackAction.SkipBy(15_000L)).currentTimeMs).isEqualTo(10_000L)
    }

    @Test
    fun `chercher sans duree connue ne fait rien`() {
        val loading = reduce(AudioPlaybackState(), AudioPlaybackAction.LoadRequested("a"))

        assertThat(reduce(loading, AudioPlaybackAction.SeekToFraction(0.5))).isEqualTo(loading)
    }

    @Test
    fun `le cycle de vitesse boucle sur toute la grille`() {
        val state = (1..PlaybackSpeed.entries.size).fold(AudioPlaybackState()) { acc, _ ->
            AudioPlaybackReducer.reduce(acc, AudioPlaybackAction.SpeedCycled)
        }

        assertThat(state.speed).isEqualTo(PlaybackSpeed.DEFAULT)
    }

    @Test
    fun `la fin naturelle revient au repos en gardant le vocal charge`() {
        val state = reduce(playing("a", at = 9_000L), AudioPlaybackAction.Ended)

        assertThat(state.isPlaying).isFalse()
        assertThat(state.currentTimeMs).isEqualTo(0L)
        assertThat(state.progress).isEqualTo(0.0)
        assertThat(state.attachmentId).isEqualTo("a")
    }

    @Test
    fun `la fin naturelle en boucle repart de zero`() {
        val state = reduce(playing("a", at = 9_000L), AudioPlaybackAction.LoopSet(true), AudioPlaybackAction.Ended)

        assertThat(state.isPlaying).isTrue()
        assertThat(state.currentTimeMs).isEqualTo(0L)
    }

    @Test
    fun `la boucle ne traverse pas une piste`() {
        val state = reduce(playing("a"), AudioPlaybackAction.LoopSet(true), AudioPlaybackAction.LoadRequested("b"))

        assertThat(state.shouldLoop).isFalse()
    }

    @Test
    fun `une erreur de chargement remet le chargement a faux`() {
        val state = reduce(AudioPlaybackState(), AudioPlaybackAction.LoadRequested("a"), AudioPlaybackAction.Failed)

        assertThat(state.isLoading).isFalse()
        assertThat(state.isPlaying).isFalse()
    }

    @Test
    fun `l'arret decharge le vocal mais garde la vitesse`() {
        val state = reduce(playing("a"), AudioPlaybackAction.SpeedSet(PlaybackSpeed.X2_0), AudioPlaybackAction.Stopped)

        assertThat(state).isEqualTo(AudioPlaybackState(speed = PlaybackSpeed.X2_0))
    }

    @Test
    fun `le vocal accuse change de nom sans perdre sa lecture ni sa position`() {
        val state = reduce(playing("cmid", at = 5_000L), AudioPlaybackAction.Relabeled("att_server"))

        assertThat(state.attachmentId).isEqualTo("att_server")
        assertThat(state.isPlaying).isTrue()
        assertThat(state.currentTimeMs).isEqualTo(5_000L)
    }

    @Test
    fun `renommer sans vocal charge ne charge rien`() {
        assertThat(reduce(AudioPlaybackState(), AudioPlaybackAction.Relabeled("att_server"))).isEqualTo(AudioPlaybackState())
    }
}
