package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MessageSticker
import me.meeshy.sdk.model.StickerRenderSource
import org.junit.Test

/** #14345 — un sticker reçu se redessine dans sa bulle, comme iOS (`BubbleContentBuilder.resolveSticker`). */
class BubbleStickerContentTest {

    private object French : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String = "fr"
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private val png = ApiMessageAttachment(id = "a1", mimeType = "image/png", fileUrl = "/u/sticker.png")

    private fun sticker(
        sticker: MessageSticker? = MessageSticker(templateId = "mee.instant-bonjour", slots = mapOf("message" to "Coucou"), emoji = "🌅"),
        attachments: List<ApiMessageAttachment> = listOf(png),
        deletedAt: String? = null,
    ) = ApiMessage(
        id = "m1",
        conversationId = "c1",
        senderId = "other",
        content = "",
        originalLanguage = "fr",
        deletedAt = deletedAt,
        sticker = sticker,
        attachments = attachments,
    )

    private fun built(message: ApiMessage) = BubbleContentBuilder.build(
        message, currentUserId = "me", preferences = French, mediaBaseUrl = "https://cdn.meeshy.me",
    )

    @Test
    fun `un sticker recu porte sa recette et son image jointe, a l'adresse servie`() {
        val content = built(sticker())
        val spec = content.sticker!!
        assertThat(spec.source).isEqualTo(StickerRenderSource.MeeInstant("instant-bonjour"))
        assertThat(spec.sticker.slots).containsExactly("message", "Coucou")
        assertThat(spec.picture?.fileUrl).isEqualTo(content.images.single().url)
    }

    @Test
    fun `un sticker plie dans les metadonnees se dessine aussi`() {
        val folded = sticker(sticker = null).copy(metadata = kotlinx.serialization.json.buildJsonObject {
            put("sticker", kotlinx.serialization.json.buildJsonObject { put("emoji", kotlinx.serialization.json.JsonPrimitive("🔥")) })
        })
        assertThat(built(folded).sticker?.source).isEqualTo(StickerRenderSource.Emoji("🔥"))
    }

    @Test
    fun `une image ordinaire, un sticker supprime ou sans rien a peindre n'ont pas de bulle de sticker`() {
        assertThat(built(sticker(sticker = null)).sticker).isNull()
        assertThat(built(sticker(deletedAt = "2026-11-02T10:00:00Z")).sticker).isNull()
        assertThat(built(sticker(sticker = MessageSticker(stickerId = "65a1b2c3d4e5f60718293a4b"), attachments = emptyList())).sticker).isNull()
    }
}
