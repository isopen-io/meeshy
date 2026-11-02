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
    fun `Simple montre six filtres essentiels`() {
        assertThat(ImageFilter.rail(ImageEditorMode.SIMPLE)).containsExactly(
            ImageFilter.ORIGINAL, ImageFilter.VIVID, ImageFilter.DRAMATIC,
            ImageFilter.MONO, ImageFilter.WARM, ImageFilter.COOL,
        ).inOrder()
    }

    @Test
    fun `Pro montre tous les filtres et effets`() {
        assertThat(ImageFilter.rail(ImageEditorMode.PRO)).hasSize(12)
        assertThat(ImageEffect.rail(ImageEditorMode.PRO)).hasSize(6)
    }

    @Test
    fun `Simple ne propose aucun effet creatif`() {
        assertThat(ImageEffect.rail(ImageEditorMode.SIMPLE)).containsExactly(ImageEffect.NONE)
    }

    @Test
    fun `le mode bascule`() {
        assertThat(ImageEditorMode.SIMPLE.toggled).isEqualTo(ImageEditorMode.PRO)
        assertThat(ImageEditorMode.PRO.toggled).isEqualTo(ImageEditorMode.SIMPLE)
    }

    @Test
    fun `un nom de fil inconnu retombe sur le neutre`() {
        assertThat(ImageFilter.fromWireName("zzz")).isEqualTo(ImageFilter.ORIGINAL)
        assertThat(ImageEffect.fromWireName(null)).isEqualTo(ImageEffect.NONE)
        assertThat(ImageFilter.fromWireName("noir")).isEqualTo(ImageFilter.NOIR)
    }
}
