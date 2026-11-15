package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.sticker.StickerUsageEntry
import org.junit.Test

class StickerFavoriteBridgeTest {
    @Test
    fun `pas de sticker pas d entree`() {
        assertThat(StickerFavoriteBridge.entry(null)).isNull()
        assertThat(StickerFavoriteBridge.state(null, emptyList())).isNull()
    }

    @Test
    fun `le gabarit passe avant son emoji de repli`() {
        val sticker = MessageSticker(templateId = "love.heartFrame", emoji = "❤️")
        assertThat(StickerFavoriteBridge.entry(sticker)).isEqualTo(StickerUsageEntry.template("love.heartFrame"))
    }

    @Test
    fun `un Mee s epingle comme Mee`() {
        val sticker = MessageSticker(templateId = "mee.mee-coucou", emoji = "👋")
        assertThat(StickerFavoriteBridge.entry(sticker)).isEqualTo(StickerUsageEntry.mee("mee-coucou"))
    }

    @Test
    fun `un pack ou un gabarit inconnu n est pas epinglable malgre son emoji`() {
        assertThat(StickerFavoriteBridge.entry(MessageSticker(templateId = "pack.x.y", emoji = "👋"))).isNull()
        assertThat(StickerFavoriteBridge.entry(MessageSticker(templateId = "inconnu", emoji = "👋"))).isNull()
    }

    @Test
    fun `un emoji seul s epingle`() {
        assertThat(StickerFavoriteBridge.entry(MessageSticker(emoji = "😀"))).isEqualTo(StickerUsageEntry.emoji("😀"))
        assertThat(StickerFavoriteBridge.entry(MessageSticker(stickerId = "a".repeat(24)))).isNull()
    }

    @Test
    fun `l etat dit si deja epingle`() {
        val sticker = MessageSticker(emoji = "😀")
        assertThat(StickerFavoriteBridge.state(sticker, listOf(StickerUsageEntry.emoji("😀")))).isTrue()
        assertThat(StickerFavoriteBridge.state(sticker, emptyList())).isFalse()
    }
}
