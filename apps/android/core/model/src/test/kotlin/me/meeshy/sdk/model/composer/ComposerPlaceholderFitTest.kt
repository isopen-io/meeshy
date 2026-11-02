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
