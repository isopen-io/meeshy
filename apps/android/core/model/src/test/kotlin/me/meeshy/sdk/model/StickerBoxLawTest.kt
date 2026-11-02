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
}
