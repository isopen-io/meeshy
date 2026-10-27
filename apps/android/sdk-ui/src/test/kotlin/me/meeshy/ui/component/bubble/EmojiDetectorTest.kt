package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class EmojiDetectorTest {

    @Test
    fun `one to four plain emoji are counted`() {
        assertThat(EmojiDetector.emojiOnlyCount("😂")).isEqualTo(1)
        assertThat(EmojiDetector.emojiOnlyCount("😂🔥")).isEqualTo(2)
        assertThat(EmojiDetector.emojiOnlyCount("😂🔥👍")).isEqualTo(3)
        assertThat(EmojiDetector.emojiOnlyCount("😂🔥👍🥰")).isEqualTo(4)
    }

    @Test
    fun `more than four emoji is not emoji-only`() {
        assertThat(EmojiDetector.emojiOnlyCount("😂🔥👍🥰🎉")).isEqualTo(0)
    }

    @Test
    fun `font sizes follow the iOS scale`() {
        assertThat(EmojiDetector.fontSizeSp(1)).isEqualTo(68)
        assertThat(EmojiDetector.fontSizeSp(2)).isEqualTo(68)
        assertThat(EmojiDetector.fontSizeSp(3)).isEqualTo(51)
        assertThat(EmojiDetector.fontSizeSp(4)).isEqualTo(34)
        assertThat(EmojiDetector.fontSizeSp(0)).isNull()
        assertThat(EmojiDetector.fontSizeSp(5)).isNull()
    }

    @Test
    fun `text or mixed content is not emoji-only`() {
        assertThat(EmojiDetector.emojiOnlyCount("hello")).isEqualTo(0)
        assertThat(EmojiDetector.emojiOnlyCount("ok 👍")).isEqualTo(0)
        assertThat(EmojiDetector.emojiOnlyCount("")).isEqualTo(0)
        assertThat(EmojiDetector.emojiOnlyCount("   ")).isEqualTo(0)
    }

    @Test
    fun `surrounding whitespace is ignored`() {
        assertThat(EmojiDetector.emojiOnlyCount(" 😂 ")).isEqualTo(1)
    }

    @Test
    fun `a zwj family sequence is one cluster`() {
        assertThat(EmojiDetector.emojiOnlyCount("👨‍👩‍👧‍👦")).isEqualTo(1)
    }

    @Test
    fun `a skin-tone modified emoji is one cluster`() {
        assertThat(EmojiDetector.emojiOnlyCount("👍🏽")).isEqualTo(1)
    }

    @Test
    fun `a flag pair of regional indicators is one cluster`() {
        assertThat(EmojiDetector.emojiOnlyCount("🇫🇷")).isEqualTo(1)
        assertThat(EmojiDetector.emojiOnlyCount("🇫🇷🇩🇪")).isEqualTo(2)
    }

    @Test
    fun `a variation-selector heart is one cluster`() {
        assertThat(EmojiDetector.emojiOnlyCount("❤️")).isEqualTo(1)
    }
}
