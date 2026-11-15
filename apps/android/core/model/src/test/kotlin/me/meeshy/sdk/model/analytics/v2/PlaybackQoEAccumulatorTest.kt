package me.meeshy.sdk.model.analytics.v2

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.analytics.v2.PlaybackSummary.ExitReason
import org.junit.Test

class PlaybackQoEAccumulatorTest {

    private fun qoe(durationMs: Int? = 10_000) =
        PlaybackQoEAccumulator("p1", "m1", durationMs, mutedAtStart = true, captionsOn = true)

    @Test
    fun `le demarrage est la premiere image et une session sans image sort avant le demarrage`() {
        val started = qoe().apply { noteFirstFrame(350); noteFirstFrame(900) }.finish(2_000, ExitReason.CLOSED)
        assertThat(started.startupMs).isEqualTo(350)
        assertThat(started.exitBeforeStart).isFalse()
        val never = qoe().finish(500, ExitReason.SWIPED)
        assertThat(never.startupMs).isNull()
        assertThat(never.exitBeforeStart).isTrue()
    }

    @Test
    fun `un buffer vide avant la premiere image est du demarrage et non un rebuffer`() {
        val s = qoe().apply { noteBufferEmpty(10); noteLikelyToKeepUp(300); noteFirstFrame(320) }
            .finish(1_000, ExitReason.CLOSED)
        assertThat(s.rebufferCount).isEqualTo(0)
        assertThat(s.rebufferMs).isEqualTo(0)
    }

    @Test
    fun `un rebuffer apres la premiere image compte et mesure sa duree, y compris ouvert a la sortie`() {
        val s = qoe().apply {
            noteFirstFrame(100)
            noteBufferEmpty(1_000); noteLikelyToKeepUp(1_400)
            noteBufferEmpty(2_000)
        }.finish(2_500, ExitReason.CLOSED)
        assertThat(s.rebufferCount).isEqualTo(2)
        assertThat(s.rebufferMs).isEqualTo(900)
    }

    @Test
    fun `le temps joue, les pauses et les recherches s'accumulent`() {
        val s = qoe().apply {
            noteFirstFrame(0)
            notePlaying(0); notePaused(1_000)
            notePlaying(2_000); notePaused(2_500)
            noteSeek(); noteSeek()
            notePlaying(3_000)
        }.finish(3_200, ExitReason.CLOSED)
        assertThat(s.playedMs).isEqualTo(1_700)
        assertThat(s.pauses).isEqualTo(2)
        assertThat(s.seeks).isEqualTo(2)
    }

    @Test
    fun `une boucle vaut tous les quartiles et la position suit le plus loin atteint`() {
        val looped = qoe().apply { noteLoop(); noteLoop() }.finish(1, ExitReason.CLOSED)
        assertThat(looped.loops).isEqualTo(2)
        assertThat(looped.quartiles).isEqualTo(15)
        val partial = qoe().apply { notePosition(5_000); notePosition(2_000) }.finish(1, ExitReason.CLOSED)
        assertThat(partial.quartiles).isEqualTo(3)
    }

    @Test
    fun `la duree connue apres coup ne remplace pas une duree declaree`() {
        assertThat(qoe(null).apply { noteDuration(8_000) }.finish(1, ExitReason.OTHER).mediaDurationMs).isEqualTo(8_000)
        assertThat(qoe(10_000).apply { noteDuration(8_000) }.finish(1, ExitReason.OTHER).mediaDurationMs).isEqualTo(10_000)
    }

    @Test
    fun `le debit moyen et les changements de rendition`() {
        val s = qoe().apply {
            noteAccessLog(1_000, renditionChanged = false)
            noteAccessLog(3_000, renditionChanged = true)
            noteAccessLog(null, renditionChanged = true)
        }.finish(1, ExitReason.CLOSED)
        assertThat(s.avgBitrateKbps).isEqualTo(2_000)
        assertThat(s.renditionChanges).isEqualTo(2)
        assertThat(qoe().finish(1, ExitReason.CLOSED).avgBitrateKbps).isNull()
    }

    @Test
    fun `le son au depart, les bascules et les sous-titres sont reportes`() {
        val s = qoe().apply { noteMuteToggled(); noteMuteToggled() }.finish(1, ExitReason.CLOSED)
        assertThat(s.mutedAtStart).isTrue()
        assertThat(s.muteToggles).isEqualTo(2)
        assertThat(s.captionsOn).isTrue()
    }

    @Test
    fun `l'erreur ne garde que le code et le domaine borne et promeut la sortie other en error`() {
        val s = qoe().apply { noteError(-1009, "x".repeat(100)) }.finish(1, ExitReason.OTHER)
        assertThat(s.errorCode).isEqualTo(-1009)
        assertThat(s.errorDomain).hasLength(64)
        assertThat(s.exitReason).isEqualTo(ExitReason.ERROR)
    }

    @Test
    fun `une raison de sortie explicite n'est pas ecrasee par une erreur`() {
        val s = qoe().apply { noteError(1, "d") }.finish(1, ExitReason.SWIPED)
        assertThat(s.exitReason).isEqualTo(ExitReason.SWIPED)
    }
}
