package me.meeshy.sdk.model.waveform

import com.google.common.truth.Truth.assertThat
import kotlin.math.PI
import kotlin.math.sin
import org.junit.Test

/**
 * La mesure d'une forme d'onde est UNE fonction pure : un RMS par compartiment. Aucun fichier,
 * aucun cache — c'est ce qui permet de dire « même signal ⇒ mêmes échantillons ». Miroir de
 * `WaveformMathTests.swift` (iOS) : mêmes vecteurs, mêmes tolérances.
 */
class WaveformMathTest {

    private fun constant(value: Float, count: Int) = FloatArray(count) { value }

    @Test
    fun `un signal constant donne partout son amplitude`() {
        val buckets = WaveformMath.rmsBuckets(constant(0.5f, 1000), count = 10)

        assertThat(buckets).hasLength(10)
        buckets.forEach { assertThat(it).isWithin(1e-4f).of(0.5f) }
    }

    @Test
    fun `la mesure est absolue, jamais divisee par la crete`() {
        val signal = constant(0f, 500) + constant(0.2f, 500)

        val buckets = WaveformMath.rmsBuckets(signal, count = 2)

        assertThat(buckets[0]).isWithin(1e-4f).of(0f)
        assertThat(buckets[1]).isWithin(1e-4f).of(0.2f)
    }

    @Test
    fun `le signe est indifferent, un carre a pour RMS son amplitude`() {
        val signal = FloatArray(800) { if (it % 2 == 0) 0.4f else -0.4f }

        WaveformMath.rmsBuckets(signal, count = 4).forEach { assertThat(it).isWithin(1e-4f).of(0.4f) }
    }

    @Test
    fun `une sinusoide d'amplitude un vaut environ un sur racine de deux`() {
        val signal = FloatArray(44_100) { sin(2 * PI * 440 * it / 44_100).toFloat() }

        WaveformMath.rmsBuckets(signal, count = 5).forEach { assertThat(it).isWithin(0.005f).of(0.70710678f) }
    }

    @Test
    fun `des bornes inegales rangent chaque echantillon dans un seul compartiment`() {
        // 10 échantillons, 3 compartiments : [0,4) [4,7) [7,10) — le compartiment de f est f*n/total.
        val signal = floatArrayOf(1f, 1f, 1f, 1f, 2f, 2f, 2f, 3f, 3f, 3f)

        val buckets = WaveformMath.rmsBuckets(signal, count = 3)

        assertThat(buckets).usingTolerance(1e-5).containsExactly(1f, 2f, 3f).inOrder()
    }

    @Test
    fun `moins d'echantillons que de compartiments laisse les vides a zero`() {
        val buckets = WaveformMath.rmsBuckets(floatArrayOf(0.5f, 0.5f), count = 4)

        assertThat(buckets).hasLength(4)
        assertThat(buckets.count { it > 0f }).isEqualTo(2)
    }

    @Test
    fun `une entree vide ou un nombre invalide rendent un releve vide`() {
        assertThat(WaveformMath.rmsBuckets(FloatArray(0), count = 8)).isEmpty()
        assertThat(WaveformMath.rmsBuckets(floatArrayOf(0.1f, 0.2f), count = 0)).isEmpty()
        assertThat(WaveformMath.rmsBuckets(floatArrayOf(0.1f, 0.2f), count = -3)).isEmpty()
    }

    @Test
    fun `lu par blocs ou d'un coup, le releve est le meme`() {
        val signal = FloatArray(10_007) { (sin(it * 0.013) * 0.8).toFloat() }
        val oneShot = WaveformMath.rmsBuckets(signal, count = 64)

        val accumulator = WaveformAccumulator(count = 64, totalFrames = signal.size.toLong())
        signal.toList().chunked(997).forEach { accumulator.append(it.toFloatArray()) }

        assertThat(accumulator.result()).usingTolerance(1e-4).containsExactly(oneShot).inOrder()
    }

    @Test
    fun `les trames au-dela de l'estimation se replient dans le dernier compartiment`() {
        val accumulator = WaveformAccumulator(count = 2, totalFrames = 4)
        accumulator.append(floatArrayOf(0f, 0f, 1f, 1f, 1f, 1f))

        val result = accumulator.result()

        assertThat(result[0]).isWithin(1e-4f).of(0f)
        assertThat(result[1]).isWithin(1e-4f).of(1f)
    }

    @Test
    fun `un bloc partiel n'ajoute que sa longueur utile`() {
        val accumulator = WaveformAccumulator(count = 1, totalFrames = 2)
        accumulator.append(floatArrayOf(1f, 1f, 9f, 9f), length = 2)

        assertThat(accumulator.result()[0]).isWithin(1e-4f).of(1f)
    }

    @Test
    fun `rien d'ajoute rend un releve vide`() {
        assertThat(WaveformAccumulator(count = 8, totalFrames = 100).result()).isEmpty()
        assertThat(WaveformAccumulator(count = 8, totalFrames = 0).result()).isEmpty()
    }

    @Test
    fun `le mono est la moyenne des canaux`() {
        val mixed = WaveformMath.monoMix(listOf(floatArrayOf(1f, 0f, 0.5f), floatArrayOf(0f, 1f, 0.5f)))

        assertThat(mixed).usingTolerance(1e-6).containsExactly(0.5f, 0.5f, 0.5f).inOrder()
        assertThat(WaveformMath.monoMix(listOf(floatArrayOf(0.3f, 0.6f)))).usingTolerance(1e-6)
            .containsExactly(0.3f, 0.6f).inOrder()
        assertThat(WaveformMath.monoMix(emptyList())).isEmpty()
    }

    @Test
    fun `des canaux de longueurs differentes ne se melangent pas`() {
        assertThat(WaveformMath.monoMix(listOf(floatArrayOf(1f, 1f), floatArrayOf(1f)))).isEmpty()
    }

    @Test
    fun `du PCM 16 bits entrelace se ramene a des flottants mono`() {
        // Stéréo little-endian : (+32767, -32768) puis (0, 16384) -> moyennes ~ -0,5/32768 et 0,25.
        val bytes = byteArrayOf(
            0xFF.toByte(), 0x7F, 0x00, 0x80.toByte(),
            0x00, 0x00, 0x00, 0x40,
        )
        val out = FloatArray(2)

        val frames = WaveformMath.monoFromInterleaved(bytes, byteCount = 8, channelCount = 2, encoding = PcmEncoding.PCM_16BIT, out = out)

        assertThat(frames).isEqualTo(2)
        assertThat(out[0]).isWithin(1e-4f).of(-0.5f / 32768f)
        assertThat(out[1]).isWithin(1e-4f).of(0.25f)
    }

    @Test
    fun `du PCM flottant entrelace se ramene a des flottants mono`() {
        val bits = java.lang.Float.floatToIntBits(0.5f)
        val half = byteArrayOf(
            (bits and 0xFF).toByte(), ((bits shr 8) and 0xFF).toByte(),
            ((bits shr 16) and 0xFF).toByte(), ((bits shr 24) and 0xFF).toByte(),
        )
        val out = FloatArray(1)

        val frames = WaveformMath.monoFromInterleaved(half, byteCount = 4, channelCount = 1, encoding = PcmEncoding.PCM_FLOAT, out = out)

        assertThat(frames).isEqualTo(1)
        assertThat(out[0]).isWithin(1e-6f).of(0.5f)
    }

    @Test
    fun `une trame incomplete en fin de bloc est ignoree`() {
        val out = FloatArray(4)

        val frames = WaveformMath.monoFromInterleaved(ByteArray(7), byteCount = 7, channelCount = 2, encoding = PcmEncoding.PCM_16BIT, out = out)

        assertThat(frames).isEqualTo(1)
    }
}
