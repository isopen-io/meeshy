package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K45 — la recette du médaillon : il nomme, il ne se touche pas ; tout se mesure en part du diamètre. */
class MeeshyMedallionTest {

    private fun resolve(
        shape: MeeshyMedallionShape = MeeshyMedallionShape.Disc,
        fill: MeeshyMedallionFill = MeeshyMedallionFill.Soft,
        decor: MeeshyMedallionDecor = MeeshyMedallionDecor.None,
        size: MeeshyMedallionSize = MeeshyMedallionSize.S44,
        state: MeeshyMedallionState = MeeshyMedallionState.Normal,
        hasValue: Boolean = false,
        reduceMotion: Boolean = false,
        supportsShape: Boolean = true,
    ) = MeeshyMedallionRecipe.resolve(shape, fill, decor, size, state, hasValue, reduceMotion, supportsShape)

    @Test
    fun `six diametres 24 36 44 52 64 96`() {
        assertThat(MeeshyMedallionSize.entries.map { it.diameterDp }).containsExactly(24, 36, 44, 52, 64, 96).inOrder()
    }

    @Test
    fun `fond doux a 18 pour cent jamais de bord ni d'ombre`() {
        val soft = resolve()
        assertThat(soft.paint).isEqualTo(MeeshyMedallionPaint.Soft)
        assertThat(soft.softAlpha).isEqualTo(0.18f)
        assertThat(soft.hasBorder).isFalse()
        assertThat(soft.hasShadow).isFalse()
    }

    @Test
    fun `le glyphe est a la moitie du diametre 14 au moins  et la valeur a 44 pour cent`() {
        assertThat(resolve(size = MeeshyMedallionSize.S96).glyphDp).isEqualTo(48f)
        assertThat(resolve(size = MeeshyMedallionSize.S24).glyphDp).isEqualTo(14f)
        assertThat(resolve(size = MeeshyMedallionSize.S96, hasValue = true).valueDp).isWithin(0.01f).of(42.24f)
    }

    @Test
    fun `carre arrondi a 34 pour cent du cote festonnee a neuf lobes`() {
        assertThat(MeeshyMedallionRecipe.SQUIRCLE_RADIUS_FRACTION).isEqualTo(0.34f)
        assertThat(MeeshyMedallionRecipe.SCALLOP_LOBES).isEqualTo(9)
    }

    @Test
    fun `une forme que la plateforme ne trace pas rend un disque`() {
        assertThat(resolve(shape = MeeshyMedallionShape.Scallop, supportsShape = false).shape).isEqualTo(MeeshyMedallionShape.Disc)
        assertThat(resolve(shape = MeeshyMedallionShape.Scallop).shape).isEqualTo(MeeshyMedallionShape.Scallop)
    }

    @Test
    fun `courant impose l'aplat  et solid rend une encre sombre`() {
        assertThat(resolve(state = MeeshyMedallionState.Current).paint).isEqualTo(MeeshyMedallionPaint.Solid)
        assertThat(resolve(fill = MeeshyMedallionFill.Solid).paint).isEqualTo(MeeshyMedallionPaint.Solid)
        assertThat(resolve(fill = MeeshyMedallionFill.Solid).hasDarkInk).isTrue()
        assertThat(resolve().hasDarkInk).isFalse()
    }

    @Test
    fun `verrouille ignore genre fond et decor - contour et cadenas`() {
        val locked = resolve(state = MeeshyMedallionState.Locked, fill = MeeshyMedallionFill.Solid, decor = MeeshyMedallionDecor.Halo)
        assertThat(locked.paint).isEqualTo(MeeshyMedallionPaint.Outline)
        assertThat(locked.decor).isEqualTo(MeeshyMedallionDecor.None)
        assertThat(locked.showsLock).isTrue()
        assertThat(locked.hasBorder).isTrue()
    }

    @Test
    fun `halo - anneau de 11 pour cent a 7 pour cent de teinte hors de la boite`() {
        val halo = resolve(decor = MeeshyMedallionDecor.Halo)
        assertThat(halo.haloFraction).isEqualTo(0.11f)
        assertThat(halo.haloAlpha).isEqualTo(0.07f)
        assertThat(halo.layoutCountsDecor).isFalse()
    }

    @Test
    fun `pointille - a 11 pour cent du bord 20 avec un halo un tour en 40 s`() {
        assertThat(resolve(decor = MeeshyMedallionDecor.Dashed).dashedInsetFraction).isEqualTo(0.11f)
        assertThat(MeeshyMedallionRecipe.DASHED_INSET_WITH_HALO).isEqualTo(0.20f)
        assertThat(MeeshyMedallionRecipe.DASHED_TURN_MILLIS).isEqualTo(40_000)
        assertThat(resolve(decor = MeeshyMedallionDecor.Dashed, reduceMotion = true).isAnimated).isFalse()
    }

    @Test
    fun `barre - 3 de trait a moins 45 degres 64 pour cent du diametre detouree de 3`() {
        val struck = resolve(decor = MeeshyMedallionDecor.Struck)
        assertThat(struck.struckStrokeDp).isEqualTo(3f)
        assertThat(struck.struckLengthFraction).isEqualTo(0.64f)
        assertThat(struck.struckAngleDegrees).isEqualTo(-45f)
        assertThat(struck.cutoutDp).isEqualTo(3f)
    }

    @Test
    fun `ondes - de un a trois anneaux un seul en mouvement reduit`() {
        assertThat(resolve(decor = MeeshyMedallionDecor.Waves(5)).waveCount).isEqualTo(3)
        assertThat(resolve(decor = MeeshyMedallionDecor.Waves(0)).waveCount).isEqualTo(1)
        assertThat(resolve(decor = MeeshyMedallionDecor.Waves(3), reduceMotion = true).waveCount).isEqualTo(1)
        assertThat(resolve(decor = MeeshyMedallionDecor.None).waveCount).isEqualTo(0)
    }

    @Test
    fun `l'organique ne derive que s'il est anime`() {
        assertThat(resolve(shape = MeeshyMedallionShape.Blob).drifts).isTrue()
        assertThat(resolve(shape = MeeshyMedallionShape.Blob, reduceMotion = true).drifts).isFalse()
        assertThat(resolve(shape = MeeshyMedallionShape.Disc).drifts).isFalse()
    }

    @Test
    fun `le gain passe de 06 a 114 puis retombe a 1`() {
        assertThat(MeeshyMedallionRecipe.earnFromScale).isEqualTo(0.6f)
        assertThat(MeeshyMedallionRecipe.earnPeakScale).isEqualTo(1.14f)
    }

    @Test
    fun `il ne se touche pas - ni cible ni etat presse ni role de bouton`() {
        val values = resolve()
        assertThat(values.hitDp).isNull()
        assertThat(values.isButton).isFalse()
    }

    @Test
    fun `sans nom il est cache a la voix avec un nom c'est une image nommee`() {
        assertThat(MeeshyMedallionRecipe.isHiddenFromVoice(label = null)).isTrue()
        assertThat(MeeshyMedallionRecipe.isHiddenFromVoice(label = "")).isTrue()
        assertThat(MeeshyMedallionRecipe.isHiddenFromVoice(label = "Or III")).isFalse()
    }

    @Test
    fun `l'anneau pointille trace a 2 et le contour verrouille est pointille a 15, comme la fiche, iOS et le web`() {
        assertThat(resolve(decor = MeeshyMedallionDecor.Dashed).dashedStrokeDp).isEqualTo(2f)
        val locked = resolve(state = MeeshyMedallionState.Locked)
        assertThat(locked.borderDp).isEqualTo(1.5f)
        assertThat(locked.borderIsDashed).isTrue()
        assertThat(resolve().borderDp).isEqualTo(0f)
    }
}
