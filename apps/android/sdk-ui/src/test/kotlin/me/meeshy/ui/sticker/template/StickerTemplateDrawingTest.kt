package me.meeshy.ui.sticker.template

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StickerTemplateDrawingTest {

    private val width: (String) -> Float = { it.length.toFloat() }

    @Test
    fun `les mots s'accumulent tant que la ligne tient`() {
        assertThat(StickerTemplateDrawing.wrapLines("un deux trois quatre", 9f, width))
            .containsExactly("un deux", "trois", "quatre").inOrder()
    }

    @Test
    fun `un mot plus long que la ligne est coupe`() {
        assertThat(StickerTemplateDrawing.wrapLines("abcdefghij", 4f, width))
            .containsExactly("abcd", "efgh", "ij").inOrder()
    }

    @Test
    fun `un texte vide donne une ligne vide, un saut de ligne est respecte`() {
        assertThat(StickerTemplateDrawing.wrapLines("", 5f, width)).containsExactly("")
        assertThat(StickerTemplateDrawing.wrapLines("a\nb", 5f, width)).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `le repli se fait a neuf fois le corps`() {
        assertThat(StickerTemplateDrawing.WRAP_BODIES).isEqualTo(9f)
    }

    @Test
    fun `les mesures d'une vignette gardent les rapports de la pastille de lieu`() {
        val m = StickerTemplateMetrics.location(1f)
        assertThat(m.fontSize).isEqualTo(42f)
        assertThat(m.horizontalPadding).isWithin(0.001f).of(22f)
        assertThat(m.verticalPadding).isWithin(0.001f).of(14f)
        assertThat(m.gap).isWithin(0.001f).of(10f)
        assertThat(StickerTemplateMetrics.preview(100f).fontSize).isWithin(0.001f).of(30f)
        assertThat(m.scaled(2f).fontSize).isEqualTo(84f)
    }

    @Test
    fun `la cle de cache trie les emplacements et distingue la densite`() {
        val m = StickerTemplateMetrics.sticker(10f)
        val a = StickerTemplateImageCache.key("x", mapOf("b" to "2", "a" to "1"), m, 2f)
        val b = StickerTemplateImageCache.key("x", mapOf("a" to "1", "b" to "2"), m, 2f)
        assertThat(a).isEqualTo(b)
        assertThat(StickerTemplateImageCache.key("x", mapOf("a" to "1"), m, 3f)).isNotEqualTo(StickerTemplateImageCache.key("x", mapOf("a" to "1"), m, 2f))
    }

    @Test
    fun `les symboles inconnus ne dessinent rien, les connus ont un glyphe`() {
        assertThat(StickerTemplateIcons.glyph("hand.wave.fill")).isNotNull()
        assertThat(StickerTemplateIcons.glyph("symbole.futur")).isNull()
    }
}
