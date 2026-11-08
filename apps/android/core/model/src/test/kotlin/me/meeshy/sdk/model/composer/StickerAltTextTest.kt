package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MessageSticker
import me.meeshy.sdk.model.sticker.MeeStickerCatalog
import me.meeshy.sdk.model.sticker.StickerTemplateCatalog
import org.junit.Test

class StickerAltTextTest {

    @Test
    fun `un sticker de Mee dit son titre`() {
        val mee = MeeStickerCatalog.all.first()
        val sticker = MessageSticker(templateId = MeeStickerCatalog.templateId(mee.id), emoji = "x")
        assertThat(StickerAltText.describe(sticker)).isEqualTo(mee.title)
    }

    @Test
    fun `les emplacements se lisent dans l'ordre du gabarit, pas celui du dictionnaire`() {
        val template = StickerTemplateCatalog.all.first { it.slots.size >= 2 }
        val names = template.slots.map { it.name }
        val reversed = names.reversed().associateWith { "v-$it" }
        val sticker = MessageSticker(templateId = template.id, slots = reversed)
        assertThat(StickerAltText.describe(sticker)).isEqualTo(names.joinToString(" ") { "v-$it" })
    }

    @Test
    fun `un emplacement vide est saute sans double espace`() {
        val template = StickerTemplateCatalog.all.first { it.slots.size >= 2 }
        val (first, second) = template.slots.map { it.name }
        val sticker = MessageSticker(templateId = template.id, slots = mapOf(first to "  ", second to "B"))
        assertThat(StickerAltText.describe(sticker)).isEqualTo("B")
    }

    @Test
    fun `un gabarit inconnu suit les cles triees`() {
        val sticker = MessageSticker(templateId = "future.x", slots = mapOf("b" to "deux", "a" to "un"))
        assertThat(StickerAltText.describe(sticker)).isEqualTo("un deux")
    }

    @Test
    fun `sans emplacement c'est l'emoji, et rien vaut null jamais vide`() {
        assertThat(StickerAltText.describe(MessageSticker(emoji = " 🎉 "))).isEqualTo("🎉")
        assertThat(StickerAltText.describe(MessageSticker(emoji = "  "))).isNull()
        assertThat(StickerAltText.describe(MessageSticker(stickerId = "lib"))).isNull()
    }
}
