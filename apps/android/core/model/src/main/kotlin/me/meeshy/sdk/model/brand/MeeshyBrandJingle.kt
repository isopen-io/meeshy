package me.meeshy.sdk.model.brand

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

/**
 * La signature sonore de Meeshy (iOS `MeeshyBrandJingle`) : 2,2 s, synthétisée — jamais un
 * fichier — donc identique à l'échantillon près sur tous les appareils.
 *
 * Arpège de La majeur ascendant (A4, C♯5, E5) puis résolution à l'octave (A5), chaque note
 * continuant de résonner sous la suivante ; sinusoïdes avec un partiel à l'octave à −18 dB,
 * attaque de 25 ms, décroissance exponentielle, normalisation à 0,62 et fondu final jusqu'au
 * silence exact. La fermeture rejoue le motif en miroir descendant sur 2 s.
 */
object MeeshyBrandJingle {

    const val DURATION_SECONDS: Double = 2.2
    const val OUTRO_DURATION_SECONDS: Double = 2.0
    const val SAMPLE_RATE: Int = 48_000

    data class Note(val frequency: Double, val onsetSeconds: Double)

    val motif: List<Note> = listOf(
        Note(440.00, 0.00),
        Note(554.37, 0.28),
        Note(659.25, 0.56),
        Note(880.00, 0.84),
    )

    val outroMotif: List<Note> = listOf(
        Note(880.00, 0.00),
        Note(659.25, 0.26),
        Note(554.37, 0.52),
        Note(440.00, 0.78),
    )

    private const val ATTACK = 0.025
    private const val DECAY_HALF_LIFE = 0.62
    private const val RELEASE_TAIL = 0.35
    private const val PEAK_AMPLITUDE = 0.62f
    private const val OCTAVE_PARTIAL_GAIN = 0.126

    /** Échantillons PCM mono dans `[-1, 1]`. */
    fun samples(sampleRate: Int = SAMPLE_RATE): FloatArray = render(motif, DURATION_SECONDS, sampleRate)

    /** Échantillons de la signature de FERMETURE (cadence descendante). */
    fun outroSamples(sampleRate: Int = SAMPLE_RATE): FloatArray =
        render(outroMotif, OUTRO_DURATION_SECONDS, sampleRate)

    private fun render(notes: List<Note>, duration: Double, sampleRate: Int): FloatArray {
        val frameCount = (duration * sampleRate).toInt()
        if (frameCount <= 0) return FloatArray(0)
        val buffer = FloatArray(frameCount)
        notes.forEach { note -> addNote(buffer, note, sampleRate) }
        normalize(buffer)
        release(buffer, sampleRate)
        return buffer
    }

    private fun addNote(buffer: FloatArray, note: Note, sampleRate: Int) {
        val onsetFrame = (note.onsetSeconds * sampleRate).toInt()
        if (onsetFrame >= buffer.size) return
        val omega = 2.0 * PI * note.frequency
        val octaveOmega = omega * 2.0
        for (frame in onsetFrame until buffer.size) {
            val t = (frame - onsetFrame).toDouble() / sampleRate
            val attackGain = if (t < ATTACK) t / ATTACK else 1.0
            val decayGain = 0.5.pow(t / DECAY_HALF_LIFE)
            val value = sin(omega * t) + OCTAVE_PARTIAL_GAIN * sin(octaveOmega * t)
            buffer[frame] += (value * attackGain * decayGain).toFloat()
        }
    }

    private fun normalize(buffer: FloatArray) {
        val peak = buffer.fold(0f) { acc, s -> max(acc, abs(s)) }
        if (peak <= 0f) return
        val scale = PEAK_AMPLITUDE / peak
        for (i in buffer.indices) buffer[i] *= scale
    }

    private fun release(buffer: FloatArray, sampleRate: Int) {
        val releaseFrames = min((RELEASE_TAIL * sampleRate).toInt(), buffer.size)
        if (releaseFrames <= 0) return
        val start = buffer.size - releaseFrames
        for (frame in start until buffer.size) {
            val progress = (frame - start).toFloat() / releaseFrames.toFloat()
            buffer[frame] *= (1f - progress)
        }
    }
}
