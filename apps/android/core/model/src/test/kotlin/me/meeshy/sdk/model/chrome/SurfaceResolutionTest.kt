package me.meeshy.sdk.model.chrome

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SurfaceResolutionTest {

    @Test
    fun `une surface translucide reste translucide sans transparence reduite`() {
        assertThat(MeeshySurface.Translucent.resolved(reduceTransparency = false))
            .isEqualTo(MeeshySurface.Translucent)
    }

    @Test
    fun `la transparence reduite force l'opaque`() {
        assertThat(MeeshySurface.Translucent.resolved(reduceTransparency = true))
            .isEqualTo(MeeshySurface.Opaque)
    }

    @Test
    fun `une surface opaque le reste`() {
        assertThat(MeeshySurface.Opaque.resolved(reduceTransparency = false))
            .isEqualTo(MeeshySurface.Opaque)
    }

    @Test
    fun `le verre est flou des l'API 31 quand un fond est enregistre`() {
        assertThat(resolveGlassRendering(sdkInt = 31, reduceTransparency = false, hasBackdrop = true))
            .isEqualTo(GlassRendering.Blurred)
        assertThat(resolveGlassRendering(sdkInt = 35, reduceTransparency = false, hasBackdrop = true))
            .isEqualTo(GlassRendering.Blurred)
    }

    @Test
    fun `sans fond enregistre le verre est translucide sans flou`() {
        assertThat(resolveGlassRendering(sdkInt = 34, reduceTransparency = false, hasBackdrop = false))
            .isEqualTo(GlassRendering.Translucent)
    }

    @Test
    fun `avant l'API 31 le verre est opaque teinte`() {
        assertThat(resolveGlassRendering(sdkInt = 30, reduceTransparency = false, hasBackdrop = true))
            .isEqualTo(GlassRendering.Opaque)
        assertThat(resolveGlassRendering(sdkInt = 26, reduceTransparency = false, hasBackdrop = false))
            .isEqualTo(GlassRendering.Opaque)
    }

    @Test
    fun `contraste eleve ou transparence reduite donne l'opaque a toute API`() {
        assertThat(resolveGlassRendering(sdkInt = 35, reduceTransparency = true, hasBackdrop = true))
            .isEqualTo(GlassRendering.Opaque)
    }
}
