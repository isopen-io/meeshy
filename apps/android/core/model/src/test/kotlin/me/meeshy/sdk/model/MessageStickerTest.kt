package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class MessageStickerTest {
    private val json = Json { ignoreUnknownKeys = true }

    private fun decode(raw: String): MessageSticker = json.decodeFromString(MessageStickerSerializer, raw)

    @Test
    fun `la forme du fil se decode telle quelle`() {
        val sticker = decode("""{"templateId":"love.heartFrame","slots":{"caption":"Toi"},"animation":"heartbeat","emoji":"❤️"}""")
        assertThat(sticker.templateId).isEqualTo("love.heartFrame")
        assertThat(sticker.slots).containsExactly("caption", "Toi")
        assertThat(sticker.animation).isEqualTo(StickerAnimation.HEARTBEAT)
        assertThat(sticker.emoji).isEqualTo("❤️")
    }

    @Test
    fun `une animation inconnue vaut null sans faire tomber le sticker`() {
        val sticker = decode("""{"templateId":"love.heartFrame","animation":"venu-du-futur","emoji":"❤️"}""")
        assertThat(sticker.animation).isNull()
        assertThat(sticker.isRenderable).isTrue()
    }

    @Test
    fun `slots absent vaut vide`() {
        assertThat(decode("""{"emoji":"❤️"}""").slots).isEmpty()
    }

    @Test
    fun `l encodage omet les null et les slots vides`() {
        val encoded = json.encodeToString(MessageStickerSerializer, MessageSticker(emoji = "❤️"))
        assertThat(encoded).isEqualTo("""{"emoji":"❤️"}""")
    }

    @Test
    fun `aller retour a l identique`() {
        val sticker = MessageSticker("mee.mee-coucou", mapOf("a" to "b"), StickerAnimation.HEARTBEAT, "👋", null)
        assertThat(decode(json.encodeToString(MessageStickerSerializer, sticker))).isEqualTo(sticker)
    }

    @Test
    fun `sans gabarit ni emoji rien a peindre mais un sticker de bibliotheque voyage`() {
        assertThat(MessageSticker().isRenderable).isFalse()
        assertThat(MessageSticker(templateId = "", emoji = "").ifRenderable).isNull()
        assertThat(MessageSticker(stickerId = "a".repeat(24)).ifWireWorthy).isNotNull()
        assertThat(MessageSticker().ifWireWorthy).isNull()
    }

    @Test
    fun `un descripteur de pack ou de Mee se garde tel quel`() {
        assertThat(decode("""{"templateId":"pack.mee.coucou","emoji":"👋"}""").templateId).isEqualTo("pack.mee.coucou")
        assertThat(decode("""{"templateId":"mee.mee-coucou"}""").isRenderable).isTrue()
    }
}
