package me.meeshy.sdk.model.waveform

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * UNE échelle d'affichage pour la mesure (RMS absolu), UNE pour le champ publié (crête-normalisé)
 * — et jamais l'une sur les données de l'autre. Miroir de `WaveformScaleTests.swift` (iOS).
 */
class WaveformScaleTest {

    @Test
    fun `la mesure se lit en decibels`() {
        val low = WaveformScale.displayHeight(0.05f)

        assertThat(low).isGreaterThan(0.4f)
        assertThat(low).isLessThan(0.8f)
    }

    @Test
    fun `le plancher est a moins soixante decibels`() {
        // 0,001 d'amplitude = −60 dB : tout juste le silence ; −40 dB (0,01) = un tiers de la hauteur.
        assertThat(WaveformScale.displayHeight(0.001f)).isWithin(1e-3f).of(0f)
        assertThat(WaveformScale.displayHeight(0.01f)).isWithin(1e-3f).of(1f / 3f)
        assertThat(WaveformScale.displayHeight(0.1f)).isWithin(1e-3f).of(2f / 3f)
    }

    @Test
    fun `le silence reste au plancher`() {
        assertThat(WaveformScale.displayHeight(0f)).isEqualTo(0f)
        assertThat(WaveformScale.displayHeight(-0.5f)).isEqualTo(0f)
        assertThat(WaveformScale.displayHeight(Float.NaN)).isEqualTo(0f)
    }

    @Test
    fun `le niveau nominal atteint le sommet et ne le depasse pas`() {
        assertThat(WaveformScale.displayHeight(1f)).isWithin(0.01f).of(1f)
        assertThat(WaveformScale.displayHeight(3f)).isWithin(0.01f).of(1f)
    }

    @Test
    fun `la hauteur croit avec le niveau`() {
        val a = WaveformScale.displayHeight(0.02f)
        val b = WaveformScale.displayHeight(0.2f)
        val c = WaveformScale.displayHeight(0.8f)

        assertThat(a).isLessThan(b)
        assertThat(b).isLessThan(c)
    }

    @Test
    fun `le nombre de compartiments est quantifie en paliers stables`() {
        assertThat(WaveformScale.bucketCount(widthDp = 100f, density = 3f))
            .isEqualTo(WaveformScale.bucketCount(widthDp = 101f, density = 3f))
        assertThat(WaveformScale.bucketCount(widthDp = 100f, density = 1f))
            .isNotEqualTo(WaveformScale.bucketCount(widthDp = 1000f, density = 3f))
    }

    @Test
    fun `le palier couvre la largeur en pixels et reste dans les bornes`() {
        assertThat(WaveformScale.bucketCount(widthDp = 1f, density = 1f)).isEqualTo(128)
        assertThat(WaveformScale.bucketCount(widthDp = 100f, density = 2.5f)).isEqualTo(256)
        assertThat(WaveformScale.bucketCount(widthDp = 300f, density = 3f)).isEqualTo(1024)
        assertThat(WaveformScale.bucketCount(widthDp = 100_000f, density = 3f)).isEqualTo(2048)
        assertThat(WaveformScale.bucketCount(widthDp = 100f, density = 0.5f)).isEqualTo(128)
    }

    @Test
    fun `les paliers sont croissants et bornes a 2048`() {
        assertThat(WaveformScale.bucketTiers).isInOrder()
        assertThat(WaveformScale.bucketTiers.last()).isEqualTo(2048)
    }

    @Test
    fun `la normalisation au pic met la crete a un et garde les proportions`() {
        val out = WaveformScale.peakNormalized(listOf(0.1f, 0.4f, 0.2f))

        assertThat(out[1]).isWithin(1e-3f).of(1f)
        assertThat(out[0]).isWithin(1e-3f).of(0.25f)
        assertThat(out[2]).isWithin(1e-3f).of(0.5f)
    }

    @Test
    fun `un signal silencieux reste a zero sans amplifier le bruit`() {
        assertThat(WaveformScale.peakNormalized(listOf(0f, 0.00001f, 0f))).containsExactly(0f, 0f, 0f).inOrder()
        assertThat(WaveformScale.peakNormalized(emptyList())).isEmpty()
    }

    @Test
    fun `le champ publie se lit lineairement et borne`() {
        assertThat(WaveformScale.publishedHeight(0.3f)).isWithin(1e-4f).of(0.3f)
        assertThat(WaveformScale.publishedHeight(1.7f)).isEqualTo(1f)
        assertThat(WaveformScale.publishedHeight(-0.2f)).isEqualTo(0f)
        assertThat(WaveformScale.publishedHeight(Float.NaN)).isEqualTo(0f)
    }

    @Test
    fun `une serie mesuree se lit en decibels`() {
        assertThat(WaveformReading.MEASURED.height(0.1f)).isWithin(1e-4f).of(WaveformScale.displayHeight(0.1f))
    }

    @Test
    fun `une serie publiee ne se lit jamais en decibels`() {
        assertThat(WaveformReading.PUBLISHED.height(0.1f)).isWithin(1e-4f).of(0.1f)
        assertThat(WaveformReading.PUBLISHED.height(1.4f)).isEqualTo(1f)
    }

    @Test
    fun `les tailles demandees tombent sur les memes cles de cache que iOS`() {
        assertThat(WaveformResolution.bubbleBars(compact = true)).isEqualTo(48)
        assertThat(WaveformResolution.bubbleBars(compact = false)).isEqualTo(72)
        assertThat(WaveformResolution.bubbleRequest(72)).isEqualTo(96)
        assertThat(WaveformResolution.bubbleRequest(48)).isEqualTo(96)
        assertThat(WaveformResolution.bubbleRequest(120)).isEqualTo(120)
        assertThat(WaveformResolution.TRANSCRIPT).isEqualTo(512)
        assertThat(WaveformResolution.TRIMMER).isEqualTo(2048)
        assertThat(WaveformResolution.DEFAULT).isEqualTo(80)
    }
}
