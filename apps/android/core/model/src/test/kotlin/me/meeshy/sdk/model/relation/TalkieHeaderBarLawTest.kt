package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import kotlin.math.pow
import org.junit.Test

/** Talkie actif, le bouton prend toute la barre d'en-tête et son onde suit la voix (#17315, #17339), iso `TalkieHeaderBarTests`. */
class TalkieHeaderBarLawTest {

    private val talking = TalkieSendPhase.Talking("u", "t")

    // Quelle voix occupe l'en-tête

    @Test
    fun `la voix qui part l'emporte, celle du pair occupe sinon, un doigt pose laisse au repos`() {
        assertThat(TalkieHeaderVoice.resolve(TalkieHoldLook.LIVE, peerSpeaking = false)).isEqualTo(TalkieHeaderVoice.OUTGOING)
        assertThat(TalkieHeaderVoice.resolve(TalkieHoldLook.IDLE, peerSpeaking = true)).isEqualTo(TalkieHeaderVoice.INCOMING)
        assertThat(TalkieHeaderVoice.resolve(TalkieHoldLook.LIVE, peerSpeaking = true)).isEqualTo(TalkieHeaderVoice.OUTGOING)
        assertThat(TalkieHeaderVoice.resolve(TalkieHoldLook.PRESSED, peerSpeaking = false)).isEqualTo(TalkieHeaderVoice.NONE)
        assertThat(TalkieHeaderVoice.resolve(TalkieHoldLook.IDLE, peerSpeaking = false)).isEqualTo(TalkieHeaderVoice.NONE)
    }

    @Test
    fun `l'apparence du bouton suit la phase et le doigt`() {
        assertThat(TalkieHoldLook.resolve(pressed = true, phase = TalkieSendPhase.Starting("u"))).isEqualTo(TalkieHoldLook.PRESSED)
        assertThat(TalkieHoldLook.resolve(pressed = false, phase = talking)).isEqualTo(TalkieHoldLook.LIVE)
        assertThat(TalkieHoldLook.resolve(pressed = false, phase = TalkieSendPhase.RecordingCopy("u"))).isEqualTo(TalkieHoldLook.LIVE)
        assertThat(TalkieHoldLook.resolve(pressed = false, phase = TalkieSendPhase.Idle)).isEqualTo(TalkieHoldLook.IDLE)
        assertThat(TalkieHoldLook.isQuickTap(299)).isTrue()
        assertThat(TalkieHoldLook.isQuickTap(300)).isFalse()
    }

    // Ce que l'en-tête montre

    @Test
    fun `au repos tout se montre, une voix en cours donne toute la barre au talkie`() {
        assertThat(TalkieHeaderChrome.resolve(TalkieHeaderVoice.NONE)).isEqualTo(TalkieHeaderChrome(true, true, true, false))
        listOf(TalkieHeaderVoice.OUTGOING, TalkieHeaderVoice.INCOMING).forEach { voice ->
            assertThat(TalkieHeaderChrome.resolve(voice)).isEqualTo(TalkieHeaderChrome(false, false, false, true))
        }
    }

    // Direct ou enregistré, visible avant la fin

    @Test
    fun `un talkie en direct est temps reel, un reveil est relaye, un repli est enregistre`() {
        assertThat(TalkieHeaderDelivery.resolve(TalkieHeaderVoice.OUTGOING, talking, waking = false)).isEqualTo(TalkieHeaderDelivery.LIVE)
        assertThat(TalkieHeaderDelivery.resolve(TalkieHeaderVoice.OUTGOING, talking, waking = true)).isEqualTo(TalkieHeaderDelivery.RELAYED)
        assertThat(TalkieHeaderDelivery.resolve(TalkieHeaderVoice.OUTGOING, TalkieSendPhase.RecordingCopy("u"), waking = false))
            .isEqualTo(TalkieHeaderDelivery.RECORDED)
        assertThat(TalkieHeaderDelivery.LIVE.isRealtime).isTrue()
        assertThat(TalkieHeaderDelivery.RELAYED.isRealtime).isFalse()
        assertThat(TalkieHeaderDelivery.RECORDED.isRealtime).isFalse()
    }

    @Test
    fun `une voix qui arrive est toujours en direct`() {
        assertThat(TalkieHeaderDelivery.resolve(TalkieHeaderVoice.INCOMING, TalkieSendPhase.Idle, waking = false)).isEqualTo(TalkieHeaderDelivery.LIVE)
        assertThat(TalkieHeaderDelivery.resolve(TalkieHeaderVoice.INCOMING, TalkieSendPhase.RecordingCopy("u"), waking = true))
            .isEqualTo(TalkieHeaderDelivery.LIVE)
    }

    // Niveau mesuré

    @Test
    fun `la moyenne quadratique du silence est nulle et celle d'un signal constant est son amplitude`() {
        assertThat(TalkieWaveLaw.rms(FloatArray(0))).isEqualTo(0f)
        assertThat(TalkieWaveLaw.rms(FloatArray(8))).isEqualTo(0f)
        assertThat(TalkieWaveLaw.rms(floatArrayOf(0.5f, -0.5f, 0.5f, -0.5f))).isWithin(0.0001f).of(0.5f)
        assertThat(TalkieWaveLaw.rms(shortArrayOf(16_384, -16_384, 16_384, 0), count = 3)).isWithin(0.0001f).of(0.5f)
        assertThat(TalkieWaveLaw.rms(ShortArray(4), count = 0)).isEqualTo(0f)
    }

    @Test
    fun `le niveau est lineaire en decibels entre le plancher et la pleine echelle, et borne`() {
        assertThat(TalkieWaveLaw.normalized(0f)).isEqualTo(0f)
        assertThat(TalkieWaveLaw.normalized(1f)).isEqualTo(1f)
        val halfway = 10.0.pow(TalkieWaveLaw.FLOOR_DECIBELS / 40.0).toFloat()
        assertThat(TalkieWaveLaw.normalized(halfway)).isWithin(0.001f).of(0.5f)
        assertThat(TalkieWaveLaw.normalized(3f)).isEqualTo(1f)
        assertThat(TalkieWaveLaw.normalized(-1f)).isEqualTo(0f)
        assertThat(TalkieWaveLaw.normalized(Float.NaN)).isEqualTo(0f)
        assertThat(TalkieWaveLaw.normalized(Float.POSITIVE_INFINITY)).isEqualTo(1f)
        assertThat(TalkieWaveLaw.normalized(0.000_01f)).isEqualTo(0f)
    }

    // Lissage

    @Test
    fun `le lissage monte vite, descend lentement, reste borne et converge`() {
        val rise = TalkieWaveLaw.smoothed(0f, 1f)
        val fall = 1 - TalkieWaveLaw.smoothed(1f, 0f)
        assertThat(rise).isGreaterThan(fall)
        assertThat(rise).isLessThan(1f)
        assertThat(TalkieWaveLaw.smoothed(0.4f, 0.4f)).isWithin(0.0001f).of(0.4f)
        assertThat(TalkieWaveLaw.smoothed(1f, 9f)).isAtMost(1f)
        assertThat(TalkieWaveLaw.smoothed(0f, -9f)).isAtLeast(0f)
        val converged = (0 until 120).fold(0f) { value, _ -> TalkieWaveLaw.smoothed(value, 0.8f) }
        assertThat(converged).isWithin(0.01f).of(0.8f)
    }

    // Niveaux → barres

    @Test
    fun `le nombre de barres remplit la largeur sans tomber a zero ni depasser la traine`() {
        assertThat(TalkieWaveLaw.barCount(300f, 3f, 3f)).isEqualTo(50)
        assertThat(TalkieWaveLaw.barCount(0f, 3f, 3f)).isEqualTo(1)
        assertThat(TalkieWaveLaw.barCount(10_000f, 3f, 3f)).isEqualTo(TalkieWaveTrail.CAPACITY)
    }

    @Test
    fun `les barres sont bornees, le plus recent a droite, le manque a gauche est le plancher`() {
        assertThat(TalkieWaveLaw.barHeights(listOf(0f, 0.5f, 1f, 7f, -2f), 5, 2f, 20f)).containsExactly(2f, 11f, 20f, 20f, 2f).inOrder()
        assertThat(TalkieWaveLaw.barHeights(listOf(1f, 0f, 1f), 2, 2f, 20f)).containsExactly(2f, 20f).inOrder()
        assertThat(TalkieWaveLaw.barHeights(listOf(1f), 3, 2f, 20f)).containsExactly(2f, 2f, 20f).inOrder()
    }

    // La traîne

    @Test
    fun `la traine avance a son propre pas, lisse, et reste bornee`() {
        val step = TalkieWaveTrail.STEP_NANOS
        val once = TalkieWaveTrail().advanced(0, 1f).advanced(step / 4, 1f)
        assertThat(once.levels).hasSize(1)
        assertThat(once.levels[0]).isLessThan(1f)
        assertThat(once.advanced(step * 101 / 100, 1f).levels).hasSize(2)
        val full = (1 until TalkieWaveTrail.CAPACITY * 2).fold(once) { trail, i -> trail.advanced(i * step * 101 / 100, 1f) }
        assertThat(full.levels).hasSize(TalkieWaveTrail.CAPACITY)
        assertThat(full.levels.last()).isWithin(0.01f).of(1f)
    }

    // L'onde miroir du direct

    @Test
    fun `l'onde miroir du silence est au plancher partout, et vide sans barre`() {
        assertThat(TalkieWaveLaw.mirroredBarHeights(0f, 9, 1.3, 3f, 24f)).containsExactlyElementsIn(List(9) { 3f })
        assertThat(TalkieWaveLaw.mirroredBarHeights(1f, 0, 0.0, 3f, 24f)).isEmpty()
    }

    @Test
    fun `l'onde miroir est symetrique, bornee, et son centre mene a pleine voix`() {
        listOf(0.0, 0.41, 2.7, 13.05).forEach { t ->
            val heights = TalkieWaveLaw.mirroredBarHeights(0.8f, 11, t, 3f, 24f)
            assertThat(heights).isEqualTo(heights.reversed())
        }
        generateSequence(0.0) { it + 0.17 }.takeWhile { it < 3.0 }.forEach { t ->
            val heights = TalkieWaveLaw.mirroredBarHeights(1f, 15, t, 3f, 24f)
            assertThat(heights.all { it in 3f..24f }).isTrue()
            assertThat(heights[7]).isGreaterThan(heights[0])
        }
    }

    @Test
    fun `l'onde miroir suit la voix, plus fort est plus haut`() {
        val quiet = TalkieWaveLaw.mirroredBarHeights(0.2f, 9, 0.5, 3f, 24f).sum()
        val loud = TalkieWaveLaw.mirroredBarHeights(0.9f, 9, 0.5, 3f, 24f).sum()
        assertThat(loud).isGreaterThan(quiet)
    }

    // Le chrono

    @Test
    fun `le chrono se lit en minutes et secondes`() {
        assertThat(TalkieWaveLaw.elapsed(0.0)).isEqualTo("0:00")
        assertThat(TalkieWaveLaw.elapsed(7.9)).isEqualTo("0:07")
        assertThat(TalkieWaveLaw.elapsed(65.0)).isEqualTo("1:05")
        assertThat(TalkieWaveLaw.elapsed(-3.0)).isEqualTo("0:00")
    }
}
