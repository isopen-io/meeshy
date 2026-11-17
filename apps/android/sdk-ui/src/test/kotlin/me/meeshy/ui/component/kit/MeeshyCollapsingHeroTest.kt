package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K28 — l'en-tête repliable : un seul nombre, `progress`, mène la hauteur, l'avatar, le titre, la bannière et le verre. */
class MeeshyCollapsingHeroTest {

    private fun at(progress: Double, hasAvatar: Boolean = true, hasSubtitle: Boolean = true, overscroll: Double = 0.0) =
        MeeshyCollapsingHeroRecipe.resolve(progress, hasAvatar = hasAvatar, hasSubtitle = hasSubtitle, overscroll = overscroll)

    @Test
    fun `deplie le heros fait 318 et la barre 96 et la hauteur suit la progression`() {
        assertThat(at(0.0).height).isEqualTo(318.0)
        assertThat(at(1.0).height).isEqualTo(96.0)
        assertThat(at(0.5).height).isWithin(1e-9).of(207.0)
    }

    @Test
    fun `l avatar et le titre finissent leur course a 55 pour cent`() {
        assertThat(at(0.0).avatarSize).isEqualTo(112.0)
        assertThat(at(0.55).avatarSize).isWithin(1e-9).of(36.0)
        assertThat(at(1.0).avatarSize).isEqualTo(36.0)
        assertThat(at(0.55).titleSize).isWithin(1e-9).of(17.0)
        assertThat(at(0.0).titleSize).isEqualTo(36.0)
        assertThat(at(0.0).subtitleSize).isEqualTo(15.0)
        assertThat(at(1.0).subtitleSize).isEqualTo(12.0)
    }

    @Test
    fun `sans avatar ni sous titre leur taille est nulle`() {
        assertThat(at(0.2, hasAvatar = false).avatarSize).isEqualTo(0.0)
        assertThat(at(0.2, hasSubtitle = false).subtitleSize).isEqualTo(0.0)
    }

    @Test
    fun `la banniere s efface de 0 a 50 pour cent et le verre apparait de 50 a 100`() {
        assertThat(at(0.0).bannerOpacity).isEqualTo(1.0)
        assertThat(at(0.25).bannerOpacity).isWithin(1e-9).of(0.5)
        assertThat(at(0.5).bannerOpacity).isEqualTo(0.0)
        assertThat(at(0.5).glassOpacity).isEqualTo(0.0)
        assertThat(at(0.75).glassOpacity).isWithin(1e-9).of(0.5)
        assertThat(at(1.0).glassOpacity).isEqualTo(1.0)
    }

    @Test
    fun `l identite passe dans la barre au dela de 50 pour cent et la barre est epinglee a 100`() {
        assertThat(at(0.5).barOwnsIdentity).isFalse()
        assertThat(at(0.51).barOwnsIdentity).isTrue()
        assertThat(at(0.99).isPinned).isFalse()
        assertThat(at(1.0).isPinned).isTrue()
    }

    @Test
    fun `une progression hors bornes ou non numerique est ramenee entre 0 et 1`() {
        assertThat(at(3.0).height).isEqualTo(96.0)
        assertThat(at(-1.0).height).isEqualTo(318.0)
        assertThat(at(Double.NaN).height).isEqualTo(318.0)
        assertThat(MeeshyCollapsingHeroRecipe.clamped(2.0)).isEqualTo(1.0)
    }

    @Test
    fun `la distance de defilement est 354 (450 deplie moins 96 replie) et un decalage la convertit en progression`() {
        assertThat(MeeshyCollapsingHeroRecipe.scrollDistance()).isEqualTo(354.0)
        assertThat(MeeshyCollapsingHeroRecipe.progress(177.0)).isWithin(1e-9).of(0.5)
        assertThat(MeeshyCollapsingHeroRecipe.progress(Double.NaN)).isEqualTo(0.0)
    }

    @Test
    fun `tirer vers le bas etire la banniere sans changer la hauteur`() {
        assertThat(at(0.0, overscroll = 40.0).bannerStretch).isEqualTo(40.0)
        assertThat(at(-0.1).bannerStretch).isWithin(1e-9).of(35.4)
        assertThat(at(0.0, overscroll = -5.0).bannerStretch).isEqualTo(0.0)
        assertThat(at(0.0, overscroll = 40.0).height).isEqualTo(318.0)
    }

    @Test
    fun `les commandes gardent une cible de 44 et le disque derriere elles s efface a 70 pour cent`() {
        assertThat(at(0.0).controlSize).isEqualTo(44.0)
        assertThat(at(0.7).controlsDiscOpacity).isWithin(1e-9).of(0.0)
        assertThat(at(0.0).controlsDiscOpacity).isEqualTo(1.0)
    }

    @Test
    fun `une seule identite glisse du heros a la barre sans changer d arbre`() {
        val unfolded = MeeshyCollapsingHeroRecipe.identity(progress = 0.0, width = 400.0, top = 24.0)
        assertThat(unfolded.avatarX).isEqualTo(20.0)
        assertThat(unfolded.avatarY).isEqualTo(232.0)
        assertThat(unfolded.titleY).isEqualTo(354.0)
        val folded = MeeshyCollapsingHeroRecipe.identity(progress = 1.0, width = 400.0, top = 24.0)
        assertThat(folded.avatarX).isEqualTo(68.0)
        assertThat(folded.avatarY).isEqualTo(28.0)
        assertThat(folded.titleX).isEqualTo(114.0)
        assertThat(folded.titleY).isEqualTo(30.0)
        assertThat(folded.titleWidth).isEqualTo(400.0 - 114.0 - 16.0)
        val midway = MeeshyCollapsingHeroRecipe.identity(progress = 0.275, width = 400.0, top = 24.0)
        assertThat(midway.avatarX).isWithin(1e-9).of(44.0)
    }

    @Test
    fun `centre l avatar et le titre se posent sur l axe tant que le titre n a pas fait la moitie de sa course`() {
        val unfolded = MeeshyCollapsingHeroRecipe.identity(progress = 0.0, width = 400.0, top = 0.0, alignment = MeeshyCollapsingHeroAlignment.Center)
        assertThat(unfolded.avatarX).isEqualTo(144.0)
        assertThat(unfolded.isTitleCentered).isTrue()
        assertThat(unfolded.titleX + unfolded.titleWidth / 2).isEqualTo(200.0)
        assertThat(MeeshyCollapsingHeroRecipe.identity(progress = 0.6, width = 400.0, top = 0.0, alignment = MeeshyCollapsingHeroAlignment.Center).isTitleCentered).isFalse()
    }
}
