package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K36 — l'épingle de personne : la précision change l'autour, jamais l'épingle. */
class MeeshyMapPinTest {

    @Test
    fun `exacte - une pointe, pas de disque`() {
        val v = MeeshyMapPinRecipe.resolve(precision = MeeshyMapPinPrecision.Exact)
        assertThat(v.drawsPoint).isTrue()
        assertThat(v.drawsDisc).isFalse()
        assertThat(v.contentDp).isEqualTo(48f)
        assertThat(v.linerDp).isEqualTo(3f)
        assertThat(v.tapTargetDp).isEqualTo(44f)
    }

    @Test
    fun `quartier et ville - un disque de deux fois le rayon, jamais de pointe`() {
        val area = MeeshyMapPinRecipe.resolve(precision = MeeshyMapPinPrecision.Area(53f))
        val wide = MeeshyMapPinRecipe.resolve(precision = MeeshyMapPinPrecision.Wide(86f))
        assertThat(area.discDiameterDp).isEqualTo(106f)
        assertThat(wide.discDiameterDp).isEqualTo(172f)
        assertThat(area.drawsPoint).isFalse()
        assertThat(area.discOpacity).isEqualTo(0.18f)
    }

    @Test
    fun `un rayon sous 32 ou illisible ne dessine pas de disque`() {
        assertThat(MeeshyMapPinRecipe.resolve(precision = MeeshyMapPinPrecision.Area(20f)).drawsDisc).isFalse()
        assertThat(MeeshyMapPinRecipe.radius(MeeshyMapPinPrecision.Wide(Float.NaN))).isEqualTo(0f)
        assertThat(MeeshyMapPinRecipe.radius(MeeshyMapPinPrecision.Wide(-4f))).isEqualTo(0f)
        assertThat(MeeshyMapPinRecipe.radius(MeeshyMapPinPrecision.Exact)).isEqualTo(0f)
    }

    @Test
    fun `selectionnee - 56, anneau, disque a 28 pour cent, au premier plan`() {
        val v = MeeshyMapPinRecipe.resolve(precision = MeeshyMapPinPrecision.Area(53f), isSelected = true)
        assertThat(v.contentDp).isEqualTo(56f)
        assertThat(v.drawsRing).isTrue()
        assertThat(v.isForeground).isTrue()
        assertThat(v.discOpacity).isEqualTo(0.28f)
    }

    @Test
    fun `perimee - grisee, disque en pointilles, aucune onde meme en direct`() {
        val v = MeeshyMapPinRecipe.resolve(precision = MeeshyMapPinPrecision.Area(53f), isStale = true, isLive = true)
        assertThat(v.contentOpacity).isEqualTo(0.55f)
        assertThat(v.discDashed).isTrue()
        assertThat(v.drawsPulse).isFalse()
    }

    @Test
    fun `en direct - une onde, immobile sous mouvement reduit`() {
        assertThat(MeeshyMapPinRecipe.resolve(isLive = true).pulseAnimates).isTrue()
        val calm = MeeshyMapPinRecipe.resolve(isLive = true, reduceMotion = true)
        assertThat(calm.drawsPulse).isTrue()
        assertThat(calm.pulseAnimates).isFalse()
    }

    @Test
    fun `la mienne - 38, lisere 2,5, onde permanente, ni disque ni pointe`() {
        val v = MeeshyMapPinRecipe.resolve(kind = MeeshyMapPinKind.Own, precision = MeeshyMapPinPrecision.Wide(86f), isSelected = true)
        assertThat(v.contentDp).isEqualTo(38f)
        assertThat(v.linerDp).isEqualTo(2.5f)
        assertThat(v.drawsPulse).isTrue()
        assertThat(v.drawsDisc).isFalse()
        assertThat(v.drawsPoint).isFalse()
        assertThat(v.drawsRing).isFalse()
    }

    @Test
    fun `presse - 0,94`() {
        assertThat(MeeshyMapPinRecipe.resolve(isPressed = true).pressScale).isEqualTo(0.94f)
        assertThat(MeeshyMapPinRecipe.resolve().pressScale).isEqualTo(1f)
    }

    @Test
    fun `la legende tient en 18 signes sur une ligne`() {
        assertThat(MeeshyMapPinRecipe.caption(null)).isNull()
        assertThat(MeeshyMapPinRecipe.caption("")).isNull()
        assertThat(MeeshyMapPinRecipe.caption("quartier")).isEqualTo("quartier")
        assertThat(MeeshyMapPinRecipe.caption("a".repeat(30))).isEqualTo("a".repeat(17) + "…")
    }

    @Test
    fun `la grappe n existe qu a partir de deux et plafonne a 99+`() {
        assertThat(MeeshyMapPinRecipe.clusterCount(1)).isNull()
        assertThat(MeeshyMapPinRecipe.clusterCount(3)).isEqualTo("3")
        assertThat(MeeshyMapPinRecipe.clusterCount(99)).isEqualTo("99")
        assertThat(MeeshyMapPinRecipe.clusterCount(100)).isEqualTo("99+")
    }
}
