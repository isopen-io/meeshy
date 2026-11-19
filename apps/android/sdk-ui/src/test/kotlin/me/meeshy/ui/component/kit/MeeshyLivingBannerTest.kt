package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K27 — la bannière vivante : trois hauteurs, deux orbes, un fondu, un capteur qui ne tourne que si tout l'autorise. */
class MeeshyLivingBannerTest {

    private fun resolve(
        mode: MeeshyLivingBannerMode = MeeshyLivingBannerMode.Banner,
        isDark: Boolean = true,
        hasImage: Boolean = false,
        isMuted: Boolean = false,
        motion: MeeshyLivingBannerMotion = MeeshyLivingBannerMotion.On,
        height: Double = MeeshyLivingBannerRecipe.HEIGHT_HERO,
        collapse: Double = 0.0,
        isVisible: Boolean = true,
        systemReduceMotion: Boolean = false,
    ) = MeeshyLivingBannerRecipe.resolve(mode, isDark, hasImage, isMuted, motion, height, collapse, isVisible, systemReduceMotion)

    @Test
    fun `les trois jalons de hauteur sont 96 130 et 318`() {
        assertThat(MeeshyLivingBannerRecipe.HEIGHT_BAR).isEqualTo(96.0)
        assertThat(MeeshyLivingBannerRecipe.HEIGHT_CARD).isEqualTo(130.0)
        assertThat(MeeshyLivingBannerRecipe.HEIGHT_HERO).isEqualTo(318.0)
    }

    @Test
    fun `les arrets du degrade sont plus soutenus en sombre qu en clair et finissent sur le fond de l ecran`() {
        assertThat(resolve(isDark = true).stopShares).containsExactly(0.72, 0.34, 0.0).inOrder()
        assertThat(resolve(isDark = false).stopShares).containsExactly(0.52, 0.20, 0.0).inOrder()
    }

    @Test
    fun `le repli ramene la hauteur a la barre et eteint la lointaine et le fondu`() {
        val folded = resolve(collapse = 1.0)
        assertThat(folded.height).isEqualTo(96.0)
        assertThat(folded.far.opacity).isEqualTo(0.0)
        assertThat(folded.fadeOpacity).isEqualTo(0.0)
        assertThat(resolve(collapse = 0.5).height).isWithin(1e-9).of(207.0)
        assertThat(resolve(collapse = Double.NaN).height).isEqualTo(318.0)
        assertThat(resolve(collapse = 7.0).height).isEqualTo(96.0)
    }

    @Test
    fun `une hauteur deja sous la barre ne se replie pas`() {
        assertThat(MeeshyLivingBannerRecipe.currentHeight(80.0, 1.0)).isEqualTo(80.0)
    }

    @Test
    fun `le fondu n existe qu en banniere et en voile et son epaisseur est 38 pour cent de la hauteur`() {
        assertThat(resolve(mode = MeeshyLivingBannerMode.Banner).showsFade).isTrue()
        assertThat(resolve(mode = MeeshyLivingBannerMode.Veil).showsFade).isTrue()
        assertThat(resolve(mode = MeeshyLivingBannerMode.Ambient).showsFade).isFalse()
        assertThat(resolve(mode = MeeshyLivingBannerMode.Fill).showsFade).isFalse()
        assertThat(resolve().fadeHeight).isWithin(1e-9).of(318.0 * 0.38)
    }

    @Test
    fun `le remplissage d une carte n a qu une orbe`() {
        assertThat(resolve(mode = MeeshyLivingBannerMode.Fill).far.diameter).isEqualTo(0.0)
        assertThat(resolve(mode = MeeshyLivingBannerMode.Fill).far.opacity).isEqualTo(0.0)
        assertThat(resolve().far.diameter).isEqualTo(180.0)
        assertThat(resolve().near.diameter).isEqualTo(220.0)
    }

    @Test
    fun `une image remplace l opacite des orbes par 12 pour cent et pose un voile de 42 pour cent`() {
        val withImage = resolve(hasImage = true)
        assertThat(withImage.near.opacity).isEqualTo(0.12)
        assertThat(withImage.imageVeil).isEqualTo(0.42)
        assertThat(resolve().imageVeil).isEqualTo(0.0)
        assertThat(resolve(isDark = false).near.opacity).isEqualTo(0.50)
    }

    @Test
    fun `le capteur ne tourne que si le mouvement est actif la banniere visible vive et le mouvement non reduit`() {
        assertThat(resolve().usesSensor).isTrue()
        assertThat(resolve(motion = MeeshyLivingBannerMotion.Reduced).usesSensor).isFalse()
        assertThat(resolve(motion = MeeshyLivingBannerMotion.Off).usesSensor).isFalse()
        assertThat(resolve(isMuted = true).usesSensor).isFalse()
        assertThat(resolve(isVisible = false).usesSensor).isFalse()
        assertThat(resolve(systemReduceMotion = true).usesSensor).isFalse()
        assertThat(resolve(mode = MeeshyLivingBannerMode.Fill).usesSensor).isFalse()
        assertThat(MeeshyLivingBannerRecipe.shouldRunSensor(MeeshyLivingBannerMotion.On, true, false, false)).isTrue()
        assertThat(MeeshyLivingBannerRecipe.shouldRunSensor(MeeshyLivingBannerMotion.Reduced, true, false, false)).isFalse()
    }

    @Test
    fun `le flottement continue en mouvement reduit mais s arrete eteint masque ou atténué`() {
        assertThat(resolve(motion = MeeshyLivingBannerMotion.Reduced).floats).isTrue()
        assertThat(resolve(motion = MeeshyLivingBannerMotion.Off).floats).isFalse()
        assertThat(resolve(isMuted = true).floats).isFalse()
        assertThat(resolve(isVisible = false).floats).isFalse()
        assertThat(resolve(isMuted = true).isDesaturated).isTrue()
    }

    @Test
    fun `la parallaxe donne 12 px a la proche et moins 6 a la lointaine a 15 degres et plafonne au dela`() {
        assertThat(MeeshyLivingBannerRecipe.parallax(15.0)).isEqualTo(MeeshyLivingBannerParallax(12.0, -6.0))
        assertThat(MeeshyLivingBannerRecipe.parallax(-40.0)).isEqualTo(MeeshyLivingBannerParallax(-12.0, 6.0))
        assertThat(MeeshyLivingBannerRecipe.parallax(0.0)).isEqualTo(MeeshyLivingBannerParallax(0.0, 0.0))
        assertThat(MeeshyLivingBannerRecipe.parallax(Double.NaN)).isEqualTo(MeeshyLivingBannerParallax(0.0, 0.0))
    }
}
