package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerPlaceholderFitTest {

    @Test fun `une invite qui tient garde sa taille`() {
        assertThat(ComposerPlaceholderFit.scale(naturalWidth = 90, availableWidth = 120)).isEqualTo(1f)
    }

    @Test fun `une invite trop large rétrécit juste assez pour tenir, comme le minimumScaleFactor d'iOS`() {
        val scale = ComposerPlaceholderFit.scale(naturalWidth = 140, availableWidth = 120)
        assertThat(scale).isWithin(0.001f).of(120f / 140f)
    }

    @Test fun `elle ne rétrécit jamais sous le plancher, l'ellipse prend le relais`() {
        assertThat(ComposerPlaceholderFit.scale(naturalWidth = 300, availableWidth = 120)).isEqualTo(ComposerPlaceholderFit.MIN_SCALE)
    }

    @Test fun `une mesure absente ne change rien`() {
        assertThat(ComposerPlaceholderFit.scale(naturalWidth = 0, availableWidth = 120)).isEqualTo(1f)
        assertThat(ComposerPlaceholderFit.scale(naturalWidth = 140, availableWidth = 0)).isEqualTo(1f)
    }
}

class ComposerPlaceholderFitMeasuredTest {

    /** Une police réelle n'est pas linéaire : à 86 % de sa taille, le mot garde 4 px d'approche et de crénage. */
    private fun measuredAt(natural: Int): (Float) -> Int = { scale -> (natural * scale).toInt() + if (scale < 1f) 4 else 0 }

    @Test fun `l'échelle retenue est celle dont la MESURE tient, pas celle du simple rapport`() {
        val measure = measuredAt(natural = 140)
        val scale = ComposerPlaceholderFit.fit(availableWidth = 120, measureAt = measure)
        assertThat(measure(scale)).isAtMost(120)
        assertThat(scale).isLessThan(120f / 140f)
        assertThat(scale).isAtLeast(ComposerPlaceholderFit.MIN_SCALE)
    }

    @Test fun `une invite qui tient n'est pas mesurée deux fois et garde sa taille`() {
        assertThat(ComposerPlaceholderFit.fit(availableWidth = 120, measureAt = measuredAt(natural = 100))).isEqualTo(1f)
    }

    @Test fun `trop large même au plancher, elle s'arrête au plancher`() {
        assertThat(ComposerPlaceholderFit.fit(availableWidth = 120, measureAt = measuredAt(natural = 400)))
            .isEqualTo(ComposerPlaceholderFit.MIN_SCALE)
    }
}
