package me.meeshy.sdk.model.chrome

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RevealGeometryTest {
    @Test
    fun `le rayon maximal atteint le coin le plus eloigne`() {
        assertThat(RevealGeometry.maxRadius(0f, 0f, 300f, 400f)).isWithin(0.001f).of(500f)
        assertThat(RevealGeometry.maxRadius(300f, 400f, 300f, 400f)).isWithin(0.001f).of(500f)
        assertThat(RevealGeometry.maxRadius(100f, 100f, 300f, 400f)).isWithin(0.001f).of(Math.hypot(200.0, 300.0).toFloat())
    }

    @Test
    fun `le rayon suit la progression et reste borne`() {
        assertThat(RevealGeometry.radius(0f, 500f)).isEqualTo(0f)
        assertThat(RevealGeometry.radius(0.5f, 500f)).isEqualTo(250f)
        assertThat(RevealGeometry.radius(1f, 500f)).isEqualTo(500f)
        assertThat(RevealGeometry.radius(1.4f, 500f)).isEqualTo(500f)
        assertThat(RevealGeometry.radius(-1f, 500f)).isEqualTo(0f)
        assertThat(RevealGeometry.radius(Float.NaN, 500f)).isEqualTo(0f)
    }

    @Test
    fun `durees ouverture 0,35 s fermeture 0,3 s reduire les animations 0,18 s`() {
        assertThat(RevealGeometry.durationMillis(opening = true, reduceMotion = false)).isEqualTo(350)
        assertThat(RevealGeometry.durationMillis(opening = false, reduceMotion = false)).isEqualTo(300)
        assertThat(RevealGeometry.durationMillis(opening = true, reduceMotion = true)).isEqualTo(180)
        assertThat(RevealGeometry.durationMillis(opening = false, reduceMotion = true)).isEqualTo(180)
    }

    @Test
    fun `le centre unitaire suit le bouton et un cadre non mesure retombe en haut a gauche`() {
        assertThat(RevealGeometry.unitCenter(30f, 600f, 300f, 1000f)).isEqualTo(UnitCenter(0.1f, 0.6f))
        assertThat(RevealGeometry.unitCenter(30f, 600f, 0f, 0f)).isEqualTo(UnitCenter(0f, 0f))
    }

    @Test
    fun `le disque couvre seulement a pleine progression`() {
        assertThat(RevealGeometry.isCovering(0.99f)).isFalse()
        assertThat(RevealGeometry.isCovering(1f)).isTrue()
        assertThat(RevealGeometry.fadeAlpha(0.4f)).isEqualTo(0.4f)
    }
}
