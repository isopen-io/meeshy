package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** #14345 — ce que la bulle d'un sticker reçu dessine, miroir d'iOS `BubbleContentBuilder.resolveSticker`. */
class BubbleStickerSpecTest {

    private val png = StickerPicture(fileUrl = "https://x/s.png")

    @Test
    fun `un message sans sticker n'a pas de bulle de sticker`() {
        assertThat(BubbleStickerSpec.resolve(null, png)).isNull()
    }

    @Test
    fun `un sticker rendable garde son image jointe comme repli`() {
        val sticker = MessageSticker(templateId = "mee.instant-bonjour", slots = mapOf("message" to "Hey"), emoji = "🌅")
        val spec = BubbleStickerSpec.resolve(sticker, png)!!
        assertThat(spec.sticker).isEqualTo(sticker)
        assertThat(spec.picture).isEqualTo(png)
        assertThat(spec.source).isEqualTo(StickerRenderSource.MeeInstant("instant-bonjour"))
    }

    @Test
    fun `un sticker de bibliotheque seul se dessine par son image, et sans image il n'existe pas`() {
        val library = MessageSticker(stickerId = "65a1b2c3d4e5f60718293a4b")
        assertThat(BubbleStickerSpec.resolve(library, png)?.source).isEqualTo(StickerRenderSource.Picture(png))
        assertThat(BubbleStickerSpec.resolve(library, null)).isNull()
    }

    @Test
    fun `un sticker vide ne vaut rien`() {
        assertThat(BubbleStickerSpec.resolve(MessageSticker(), png)).isNull()
    }

    @Test
    fun `un film de Mee, un gabarit connu et un emoji se dessinent sans leur image`() {
        assertThat(BubbleStickerSpec.resolve(MessageSticker(templateId = "mee.mee-coucou"), png)?.source)
            .isEqualTo(StickerRenderSource.Mee("mee-coucou"))
        assertThat(BubbleStickerSpec.resolve(MessageSticker(templateId = "text.neon", slots = mapOf("text" to "Yo")), png)?.source)
            .isEqualTo(StickerRenderSource.Template("text.neon"))
        assertThat(BubbleStickerSpec.resolve(MessageSticker(emoji = "🔥"), png)?.source).isEqualTo(StickerRenderSource.Emoji("🔥"))
    }

    @Test
    fun `un gabarit inconnu de ce binaire retombe sur l'image jointe, puis sur son emoji`() {
        val unknown = MessageSticker(templateId = "weather.sun", emoji = "☀️")
        assertThat(BubbleStickerSpec.resolve(unknown, png)?.source).isEqualTo(StickerRenderSource.Picture(png))
        assertThat(BubbleStickerSpec.resolve(unknown, null)?.source).isEqualTo(StickerRenderSource.Emoji("☀️"))
    }
}
