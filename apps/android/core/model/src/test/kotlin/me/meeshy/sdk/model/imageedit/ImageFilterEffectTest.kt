package me.meeshy.sdk.model.imageedit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ImageFilterEffectTest {
    @Test
    fun `douze filtres et six effets`() {
        assertThat(ImageFilter.entries).hasSize(12)
        assertThat(ImageEffect.entries).hasSize(6)
    }

    @Test
    fun `un nom de fil inconnu retombe sur le neutre`() {
        assertThat(ImageFilter.fromWireName("zzz")).isEqualTo(ImageFilter.ORIGINAL)
        assertThat(ImageEffect.fromWireName(null)).isEqualTo(ImageEffect.NONE)
        assertThat(ImageFilter.fromWireName("noir")).isEqualTo(ImageFilter.NOIR)
    }
}
