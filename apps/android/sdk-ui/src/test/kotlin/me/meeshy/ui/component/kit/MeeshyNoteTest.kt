package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K46 — la recette de la note : elle dit, elle reste, elle occupe de la place et la rend. */
class MeeshyNoteTest {

    private fun resolve(
        form: MeeshyNoteForm = MeeshyNoteForm.Line,
        kind: MeeshyNoteKind = MeeshyNoteKind.Neutral,
        lead: MeeshyNoteLeadShape = MeeshyNoteLeadShape.Glyph,
        size: MeeshyNoteSize = MeeshyNoteSize.Regular,
        isStale: Boolean = false,
        hasDetail: Boolean = true,
        hasAction: Boolean = false,
        reduceMotion: Boolean = false,
    ) = MeeshyNoteRecipe.resolve(form, kind, lead, size, isStale, hasDetail, hasAction, reduceMotion)

    @Test
    fun `texte 125 en ligne 13 en bande 14 en bandeau interligne 14`() {
        assertThat(resolve(form = MeeshyNoteForm.Line).textSp).isEqualTo(12.5f)
        assertThat(resolve(form = MeeshyNoteForm.Band).textSp).isEqualTo(13f)
        assertThat(resolve(form = MeeshyNoteForm.Banner).textSp).isEqualTo(14f)
        assertThat(resolve().lineHeightFactor).isEqualTo(1.4f)
    }

    @Test
    fun `glyphe de 16 de 22 en bandeau  et point de 9`() {
        assertThat(resolve(form = MeeshyNoteForm.Line).glyphDp).isEqualTo(16)
        assertThat(resolve(form = MeeshyNoteForm.Banner).glyphDp).isEqualTo(22)
        assertThat(MeeshyNoteRecipe.DOT_DP).isEqualTo(9)
    }

    @Test
    fun `le bandeau - rayon 16 teinte a 10 pour cent pleine largeur`() {
        val banner = resolve(form = MeeshyNoteForm.Banner)
        assertThat(banner.cornerRadiusDp).isEqualTo(16)
        assertThat(banner.tintAlpha).isEqualTo(0.10f)
        assertThat(banner.fillsWidth).isTrue()
        assertThat(banner.insetsDp).containsExactly(12, 14, 12, 18).inOrder()
    }

    @Test
    fun `la bande - pleine largeur sans rayon 48 au moins filet bas et barre d'accent de 3`() {
        val band = resolve(form = MeeshyNoteForm.Band)
        assertThat(band.cornerRadiusDp).isEqualTo(0)
        assertThat(band.minHeightDp).isEqualTo(48)
        assertThat(band.hasBottomHairline).isTrue()
        assertThat(band.accentBarDp).isEqualTo(3)
        assertThat(resolve(form = MeeshyNoteForm.Line).accentBarDp).isEqualTo(0)
    }

    @Test
    fun `la forme live prend un point pulse et la phrase teintee demi-grasse`() {
        val live = resolve(form = MeeshyNoteForm.Live, lead = MeeshyNoteLeadShape.Pulse)
        assertThat(live.textSp).isEqualTo(13.5f)
        assertThat(live.textWeight).isEqualTo(600)
        assertThat(live.tintsText).isTrue()
        assertThat(live.pulses).isTrue()
    }

    @Test
    fun `donnee perimee - le point s'arrete et la teinte tombe au neutre`() {
        val stale = resolve(form = MeeshyNoteForm.Live, lead = MeeshyNoteLeadShape.Pulse, kind = MeeshyNoteKind.Ok, isStale = true)
        assertThat(stale.pulses).isFalse()
        assertThat(stale.kind).isEqualTo(MeeshyNoteKind.Neutral)
    }

    @Test
    fun `mouvement reduit - point fixe a halo pose fondu de 150 ms pas de hauteur animee`() {
        val reduced = resolve(form = MeeshyNoteForm.Live, lead = MeeshyNoteLeadShape.Pulse, reduceMotion = true)
        assertThat(reduced.pulses).isFalse()
        assertThat(reduced.showsHalo).isTrue()
        assertThat(reduced.animatesHeight).isFalse()
        assertThat(MeeshyNoteRecipe.CROSSFADE_MILLIS).isEqualTo(150)
        assertThat(resolve().animatesHeight).isTrue()
    }

    @Test
    fun `la seconde ligne est ignoree en ligne et en live`() {
        assertThat(resolve(form = MeeshyNoteForm.Line, hasDetail = true).showsDetail).isFalse()
        assertThat(resolve(form = MeeshyNoteForm.Live, hasDetail = true).showsDetail).isFalse()
        assertThat(resolve(form = MeeshyNoteForm.Band, hasDetail = true).showsDetail).isTrue()
        assertThat(resolve(form = MeeshyNoteForm.Band, hasDetail = false).showsDetail).isFalse()
    }

    @Test
    fun `l'action passe a la ligne sous 320 de large`() {
        assertThat(MeeshyNoteRecipe.actionWraps(widthDp = 300f)).isTrue()
        assertThat(MeeshyNoteRecipe.actionWraps(widthDp = 320f)).isFalse()
    }

    @Test
    fun `seul warn s'annonce par defaut et une fois`() {
        assertThat(MeeshyNoteRecipe.announces(MeeshyNoteKind.Warn, explicit = null)).isTrue()
        assertThat(MeeshyNoteRecipe.announces(MeeshyNoteKind.Security, explicit = null)).isFalse()
        assertThat(MeeshyNoteRecipe.announces(MeeshyNoteKind.Info, explicit = true)).isTrue()
        assertThat(MeeshyNoteRecipe.announces(MeeshyNoteKind.Warn, explicit = false)).isFalse()
    }

    @Test
    fun `la liste prend 13 en compact et 145 en regulier`() {
        assertThat(MeeshyNoteRecipe.listTextSp(MeeshyNoteSize.Compact)).isEqualTo(13f)
        assertThat(MeeshyNoteRecipe.listTextSp(MeeshyNoteSize.Regular)).isEqualTo(14.5f)
    }

    @Test
    fun `une note n'est jamais fermee d'une croix ni minutee`() {
        val values = resolve(form = MeeshyNoteForm.Banner)
        assertThat(values.isDismissible).isFalse()
        assertThat(values.autoHides).isFalse()
    }

    @Test
    fun `la phrase vide ne rend rien`() {
        assertThat(MeeshyNoteRecipe.isVisible("")).isFalse()
        assertThat(MeeshyNoteRecipe.isVisible("   ")).isFalse()
        assertThat(MeeshyNoteRecipe.isVisible("Hors ligne")).isTrue()
    }

    @Test
    fun `la valeur en gras est decoupee ou qu'elle tombe sans toucher a la phrase`() {
        assertThat(MeeshyNoteRecipe.segments("Léo te verra dans un rayon de 5 km", emphasis = "5 km"))
            .containsExactly(MeeshyNoteSegment("Léo te verra dans un rayon de ", false), MeeshyNoteSegment("5 km", true)).inOrder()
        assertThat(MeeshyNoteRecipe.segments("abc", emphasis = "zzz")).containsExactly(MeeshyNoteSegment("abc", false))
        assertThat(MeeshyNoteRecipe.segments("abc", emphasis = null)).containsExactly(MeeshyNoteSegment("abc", false))
    }
}
