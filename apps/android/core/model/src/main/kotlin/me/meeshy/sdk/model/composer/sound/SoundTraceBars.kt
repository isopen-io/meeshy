package me.meeshy.sdk.model.composer.sound

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin

/**
 * Les barres de l'onde d'une trace sonore (fraction de la hauteur, 0..1) — le RELEVÉ quand on l'a, une sinusoïde
 * sinon. Le repli n'est pas décoratif : un brouillon restauré arrive avec un tableau vide, et une bande plate se lirait
 * comme un SILENCE, ce que le son n'est pas. `waveformSamples` est le champ PUBLIÉ, normalisé au pic : linéaire.
 */
object SoundTraceBars {
    const val FLOOR: Float = 0.12f

    fun heights(samples: List<Float>, count: Int): List<Float> =
        List(count) { i ->
            if (samples.isEmpty()) {
                val phase = i.toDouble() / count * PI * 2
                (0.35 + 0.45 * abs(sin(phase))).toFloat()
            } else {
                samples[minOf(samples.size - 1, i * samples.size / count)].coerceIn(0f, 1f).coerceAtLeast(FLOOR)
            }
        }
}
