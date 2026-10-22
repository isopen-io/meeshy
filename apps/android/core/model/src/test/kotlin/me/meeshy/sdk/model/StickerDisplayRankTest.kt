package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StickerDisplayRankTest {
    @Test
    fun `le gabarit passe avant l image qui passe avant l emoji`() {
        assertThat(StickerDisplayRank.kindOf("tpl", "media")).isEqualTo(StickerKind.TEMPLATE)
        assertThat(StickerDisplayRank.kindOf("", "media")).isEqualTo(StickerKind.IMAGE)
        assertThat(StickerDisplayRank.kindOf("", "")).isEqualTo(StickerKind.EMOJI)
    }

    @Test
    fun `l emoji propre au sticker gagne sur tout repli`() {
        assertThat(StickerDisplayRank.wireEmoji("😀", "tpl") { "🎉" }).isEqualTo("😀")
    }

    @Test
    fun `un gabarit seul prend le repli de son gabarit puis le repli generique`() {
        assertThat(StickerDisplayRank.wireEmoji("", "tpl") { "🎉" }).isEqualTo("🎉")
        assertThat(StickerDisplayRank.wireEmoji("", "tpl")).isEqualTo(StickerDisplayRank.IMAGE_FALLBACK_EMOJI)
        assertThat(StickerDisplayRank.wireEmoji("", "")).isEqualTo(StickerDisplayRank.IMAGE_FALLBACK_EMOJI)
    }

    @Test
    fun `le sticker expose son genre et son mouvement connu`() {
        val gabarit = StorySticker(id = "s", templateId = "t1", animation = "pulse")
        assertThat(gabarit.kind).isEqualTo(StickerKind.TEMPLATE)
        assertThat(gabarit.stickerAnimation).isEqualTo(StickerAnimation.PULSE)
        assertThat(StorySticker(id = "s", animation = "futur").stickerAnimation).isNull()
    }
}
