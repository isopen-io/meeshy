package me.meeshy.ui.component.chrome

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LiquidGlassRecipeTest {

    @Test
    fun `sombre non teinte`() {
        val r = LiquidGlassRecipe.resolve(isDark = true, isTinted = false)
        assertThat(r.tintWash).isEqualTo(0f)
        assertThat(r.sheen).isEqualTo(0.10f)
        assertThat(r.rimLit).isEqualTo(0.32f)
        assertThat(r.rimShade).isEqualTo(0.06f)
        assertThat(r.shadowOpacity).isEqualTo(0.35f)
        assertThat(r.shadowRadiusDp).isEqualTo(14f)
    }

    @Test
    fun `sombre teinte`() {
        assertThat(LiquidGlassRecipe.resolve(isDark = true, isTinted = true).tintWash).isEqualTo(0.22f)
    }

    @Test
    fun `clair non teinte`() {
        val r = LiquidGlassRecipe.resolve(isDark = false, isTinted = false)
        assertThat(r.tintWash).isEqualTo(0f)
        assertThat(r.sheen).isEqualTo(0.32f)
        assertThat(r.rimLit).isEqualTo(0.75f)
        assertThat(r.rimShade).isEqualTo(0.14f)
        assertThat(r.shadowOpacity).isEqualTo(0.12f)
    }

    @Test
    fun `clair teinte`() {
        assertThat(LiquidGlassRecipe.resolve(isDark = false, isTinted = true).tintWash).isEqualTo(0.16f)
    }
}
