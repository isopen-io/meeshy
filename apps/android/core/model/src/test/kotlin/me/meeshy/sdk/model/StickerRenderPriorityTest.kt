package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.sticker.MeeInstantCatalog
import me.meeshy.sdk.model.sticker.MeeStickerCatalog
import org.junit.Test

class StickerRenderPriorityTest {

    private val png = StickerPicture(fileUrl = "https://x/s.png")
    private fun resolve(
        sticker: MessageSticker,
        picture: StickerPicture? = png,
        known: Set<String> = emptySet(),
    ) = StickerRenderSource.resolve(sticker, picture, { it in known }) { if (it == "tpl.unknown") "🎉" else null }

    @Test
    fun `un film Mee embarque passe avant tout`() {
        val mee = MeeStickerCatalog.all.first()
        val s = MessageSticker(templateId = mee.templateId, emoji = "😀")
        assertThat(resolve(s, known = setOf(mee.templateId))).isEqualTo(StickerRenderSource.Mee(mee.id))
    }

    @Test
    fun `un Instant embarque vient apres les films`() {
        val instant = MeeInstantCatalog.all.first()
        assertThat(resolve(MessageSticker(templateId = instant.templateId)))
            .isEqualTo(StickerRenderSource.MeeInstant(instant.id))
    }

    @Test
    fun `un gabarit vectoriel connu est dessine`() {
        val s = MessageSticker(templateId = "tpl.known")
        assertThat(resolve(s, known = setOf("tpl.known"))).isEqualTo(StickerRenderSource.Template("tpl.known"))
    }

    @Test
    fun `un gabarit inconnu retombe sur le PNG joint`() {
        assertThat(resolve(MessageSticker(templateId = "tpl.unknown"))).isEqualTo(StickerRenderSource.Picture(png))
    }

    @Test
    fun `sans PNG un gabarit inconnu retombe sur son emoji de repli`() {
        assertThat(resolve(MessageSticker(templateId = "tpl.unknown"), picture = null))
            .isEqualTo(StickerRenderSource.Emoji("🎉"))
    }

    @Test
    fun `un sticker emoji sans gabarit se rend en glyphe jamais par son PNG`() {
        assertThat(resolve(MessageSticker(emoji = "😀"))).isEqualTo(StickerRenderSource.Emoji("😀"))
    }

    @Test
    fun `un PNG vide est ignore et le repli final est l image`() {
        val s = MessageSticker(stickerId = "lib1")
        assertThat(resolve(s, picture = StickerPicture(fileUrl = "")))
            .isEqualTo(StickerRenderSource.Emoji(StickerDisplayRank.IMAGE_FALLBACK_EMOJI))
    }

    @Test
    fun `l emoji du sticker prime sur le repli du gabarit`() {
        val s = MessageSticker(templateId = "tpl.unknown", emoji = "🔥")
        assertThat(resolve(s, picture = null)).isEqualTo(StickerRenderSource.Emoji("🔥"))
    }

    @Test
    fun `la resolution est deterministe`() {
        val s = MessageSticker(templateId = "tpl.unknown")
        assertThat(resolve(s)).isEqualTo(resolve(s))
    }
}
