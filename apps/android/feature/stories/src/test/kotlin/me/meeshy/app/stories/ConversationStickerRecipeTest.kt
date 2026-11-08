package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MessageSticker
import me.meeshy.sdk.model.StickerAnimation
import me.meeshy.sdk.model.sticker.StickerSheetChoice
import org.junit.Test

/** #14334 — ce qu'un sticker de conversation emporte, comme iOS et le web (`MessageSticker`). */
class ConversationStickerRecipeTest {

    @Test
    fun `un emoji part avec son glyphe`() {
        val choice = StickerSheetChoice.Emoji("🔥")
        assertThat(ConversationStickerRecipe.of(choice, StickerChoiceRoute.Glyph("🔥"))).isEqualTo(MessageSticker(emoji = "🔥"))
    }

    @Test
    fun `un gabarit part avec ses emplacements, son mouvement et son emoji de repli`() {
        val slots = mapOf("text" to "Coucou")
        val recipe = ConversationStickerRecipe.of(
            StickerSheetChoice.Template("text.speechBubble", slots),
            StickerChoiceRoute.Template("text.speechBubble", slots),
        )
        assertThat(recipe).isEqualTo(
            MessageSticker(templateId = "text.speechBubble", slots = slots, animation = StickerAnimation.POP, emoji = "💬"),
        )
    }

    @Test
    fun `un film de Mee part sous son gabarit mee point id`() {
        val recipe = ConversationStickerRecipe.of(StickerSheetChoice.Mee("mee-coucou"), StickerChoiceRoute.MeeImage("mee-coucou", "👋"))
        assertThat(recipe).isEqualTo(MessageSticker(templateId = "mee.mee-coucou", emoji = "👋"))
    }

    @Test
    fun `un sticker de pack part sous pack point slug point cle, sans emoji de repli invente`() {
        val choice = StickerSheetChoice.PackItem("fruits", "pomme")
        assertThat(ConversationStickerRecipe.of(choice, StickerChoiceRoute.PackImage("/p.png", "🍎")))
            .isEqualTo(MessageSticker(templateId = "pack.fruits.pomme", emoji = "🍎"))
        assertThat(ConversationStickerRecipe.of(choice, StickerChoiceRoute.PackImage("/p.png", "🖼️"))?.emoji).isNull()
    }

    @Test
    fun `Mes stickers part en image seule, sauf un identifiant de serveur`() {
        assertThat(ConversationStickerRecipe.of(StickerSheetChoice.Library("a1b2"), StickerChoiceRoute.LibraryImage("4f3c2b1a-local"))).isNull()
        val serverId = "65A1B2C3D4E5F60718293A4B"
        assertThat(ConversationStickerRecipe.of(StickerSheetChoice.Library(serverId), StickerChoiceRoute.LibraryImage(serverId)))
            .isEqualTo(MessageSticker(stickerId = serverId.lowercase()))
    }

    @Test
    fun `un Instant part sous mee point id avec ses emplacements et son emoji de repli`() {
        val slots = mapOf("message" to "Coucou", "time" to "08:00")
        val recipe = ConversationStickerRecipe.of(
            StickerSheetChoice.Instant("instant-bonjour", slots),
            StickerChoiceRoute.InstantImage("instant-bonjour", slots),
        )
        assertThat(recipe).isEqualTo(MessageSticker(templateId = "mee.instant-bonjour", slots = slots, emoji = "🌅"))
    }
}
