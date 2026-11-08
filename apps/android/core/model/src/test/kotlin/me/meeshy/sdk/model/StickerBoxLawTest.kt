package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StickerBoxLawTest {

    @Test
    fun `le carre mesure 200 dp pour un film une image ou un instant`() {
        assertThat(StickerBoxLaw.artworkBox(StickerRenderSource.Mee("a")))
            .isEqualTo(StickerBoxLaw.Size(200f, 200f))
        assertThat(StickerBoxLaw.artworkBox(StickerRenderSource.Picture(StickerPicture("u"))))
            .isEqualTo(StickerBoxLaw.Size(200f, 200f))
    }

    @Test
    fun `l emoji a une boite de 80 dp et un corps de 118 dp`() {
        assertThat(StickerBoxLaw.artworkBox(StickerRenderSource.Emoji("x")))
            .isEqualTo(StickerBoxLaw.Size(80f, 80f))
        assertThat(StickerBoxLaw.EMOJI_GLYPH_DP).isEqualTo(118f)
    }

    @Test
    fun `le cartouche est une fois et demie plus large que haut`() {
        val box = StickerBoxLaw.templateBox()
        assertThat(box.width / box.height).isEqualTo(1.5f)
        assertThat(box.height).isEqualTo(200f)
    }

    @Test
    fun `un gabarit rasterise est reduit pour tenir sans etre agrandi`() {
        val tpl = StickerRenderSource.Template("t")
        assertThat(StickerBoxLaw.artworkBox(tpl, templateSize = StickerBoxLaw.Size(600f, 200f)))
            .isEqualTo(StickerBoxLaw.Size(300f, 100f))
        assertThat(StickerBoxLaw.artworkBox(tpl, templateSize = StickerBoxLaw.Size(100f, 50f)))
            .isEqualTo(StickerBoxLaw.Size(100f, 50f))
        assertThat(StickerBoxLaw.artworkBox(tpl)).isEqualTo(StickerBoxLaw.Size(300f, 200f))
    }

    @Test
    fun `la place est reservee avant rasterisation`() {
        assertThat(StickerBoxLaw.reservedTemplateBox(StickerBoxLaw.Size(100f, 80f), dieCutMargin = 10f))
            .isEqualTo(StickerBoxLaw.Size(120f, 100f))
        assertThat(StickerBoxLaw.reservedTemplateBox(null, 10f)).isEqualTo(StickerBoxLaw.Size(200f, 200f))
    }

    @Test
    fun `une taille degeneree ne reserve rien`() {
        assertThat(StickerBoxLaw.fitted(StickerBoxLaw.Size(0f, 10f), StickerBoxLaw.templateBox()))
            .isEqualTo(StickerBoxLaw.Size.ZERO)
    }

    @Test
    fun `un film garde une marge de debordement sur ses quatre bords pour s animer sans etre rogne`() {
        val side = StickerBoxLaw.SIDE_DP
        val bleed = StickerBoxLaw.filmBleed(side)
        assertThat(bleed).isGreaterThan(0f)
        assertThat(StickerBoxLaw.filmFootprint(side)).isEqualTo(side + 2 * bleed)
        assertThat(StickerBoxLaw.filmBleed(140f) / 140f).isEqualTo(bleed / side)
    }

    @Test
    fun `la ligne d un emoji en grand depasse son corps pour en loger l encre`() {
        assertThat(StickerBoxLaw.EMOJI_LINE_HEIGHT_RATIO).isAtLeast(1.25f)
    }

    @Test
    fun `dans un couloir etroit le film se reduit juste assez pour que sa marge tienne`() {
        assertThat(StickerBoxLaw.filmSideWithin(width = 400f, preferred = 140f)).isEqualTo(140f)
        val side = StickerBoxLaw.filmSideWithin(width = 120f, preferred = 140f)
        assertThat(StickerBoxLaw.filmFootprint(side)).isWithin(0.001f).of(120f)
    }
}
