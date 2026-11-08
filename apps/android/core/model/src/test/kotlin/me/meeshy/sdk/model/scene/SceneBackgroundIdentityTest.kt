package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SceneBackgroundIdentityTest {
    private val red = 0xFFFF0000L
    private val almostRed = 0xFFFE0000L

    @Test
    fun `une identite est stable pour un meme fond`() {
        assertThat(SceneBackgroundIdentity.of(SceneBackgroundKind.SolidColor(red)))
            .isEqualTo(SceneBackgroundIdentity.of(SceneBackgroundKind.SolidColor(red)))
    }

    @Test
    fun `la moindre nouvelle couleur reconstruit la couche`() {
        assertThat(SceneBackgroundIdentity.keepsLayer(SceneBackgroundKind.SolidColor(red), SceneBackgroundKind.SolidColor(almostRed))).isFalse()
        val g = SceneBackgroundKind.Gradient(listOf(red, 0xFF0000FFL))
        assertThat(SceneBackgroundIdentity.keepsLayer(g, g.copy())).isTrue()
        assertThat(SceneBackgroundIdentity.keepsLayer(g, g.copy(argb = listOf(red, 0xFF0000FEL)))).isFalse()
        assertThat(SceneBackgroundIdentity.keepsLayer(g, g.copy(direction = "horizontal"))).isFalse()
    }

    @Test
    fun `l identite d un media ne porte ni le mute ni le volume`() {
        assertThat(SceneBackgroundIdentity.of(SceneBackgroundKind.Image("a1"))).isEqualTo("image:a1")
        assertThat(SceneBackgroundIdentity.of(SceneBackgroundKind.Video("v1", looping = true))).isEqualTo("video:v1:true")
        assertThat(SceneBackgroundIdentity.of(SceneBackgroundKind.Video("v1", looping = false))).isNotEqualTo("video:v1:true")
    }

    @Test
    fun `aucune couche precedente ne se garde`() {
        assertThat(SceneBackgroundIdentity.keepsLayer(null, SceneBackgroundKind.Image("a"))).isFalse()
    }

    @Test
    fun `un fichier local du composer est resolu avant l adresse distante`() {
        val resolver: (String) -> String? = { "https://cdn/$it" }
        assertThat(SceneBackgroundIdentity.resolvedUrl("file:///tmp/a.jpg", resolver)).isEqualTo("file:///tmp/a.jpg")
        assertThat(SceneBackgroundIdentity.resolvedUrl("64b0c0ffee0123456789abcd", resolver)).isEqualTo("https://cdn/64b0c0ffee0123456789abcd")
        assertThat(SceneBackgroundIdentity.resolvedUrl("2026/09/u/f.mp4", { null })).isEqualTo("2026/09/u/f.mp4")
    }

    @Test
    fun `une identite sans adresse ni resolveur ne mene nulle part, un aplat si`() {
        assertThat(SceneBackgroundIdentity.canResolve(SceneBackgroundKind.Image("64b0c0ffee0123456789abcd")) { null }).isFalse()
        assertThat(SceneBackgroundIdentity.canResolve(SceneBackgroundKind.Video("64b0c0ffee0123456789abcd")) { "u" }).isTrue()
        assertThat(SceneBackgroundIdentity.canResolve(SceneBackgroundKind.SolidColor(red)) { null }).isTrue()
    }
}
