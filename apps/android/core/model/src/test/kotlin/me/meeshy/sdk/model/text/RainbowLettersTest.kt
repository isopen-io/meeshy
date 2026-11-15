package me.meeshy.sdk.model.text

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MessageSegment
import org.junit.Test

class RainbowLettersTest {

    @Test fun `golden vectors of the Swift implementation`() {
        assertThat(RainbowLetters.colorIndices(16, "msg-1", 6))
            .containsExactly(3, 5, 4, 1, 0, 1, 0, 1, 0, 3, 1, 2, 1, 0, 2, 5).inOrder()
        assertThat(RainbowLetters.colorIndices(12, "msg-2", 6))
            .containsExactly(0, 4, 0, 1, 2, 1, 2, 3, 2, 5, 0, 3).inOrder()
        assertThat(RainbowLetters.colorIndices(8, "m", 3))
            .containsExactly(2, 0, 2, 0, 2, 0, 2, 1).inOrder()
        assertThat(RainbowLetters.colorIndices(5, "x", 1)).containsExactly(0, 0, 0, 0, 0)
    }

    @Test fun `same seed same colours and another seed another draw`() {
        assertThat(RainbowLetters.colorIndices(40, "msg-1", 6)).isEqualTo(RainbowLetters.colorIndices(40, "msg-1", 6))
        assertThat(RainbowLetters.colorIndices(40, "msg-1", 6)).isNotEqualTo(RainbowLetters.colorIndices(40, "msg-2", 6))
    }

    @Test fun `no two neighbours are equal`() {
        val indices = RainbowLetters.colorIndices(500, "msg-3", 6)
        assertThat(indices.zipWithNext().none { (a, b) -> a == b }).isTrue()
        assertThat(indices.all { it in 0..5 }).isTrue()
    }

    @Test fun `degenerate sizes give nothing`() {
        assertThat(RainbowLetters.colorIndices(0, "s", 6)).isEmpty()
        assertThat(RainbowLetters.colorIndices(3, "s", 0)).isEmpty()
    }

    @Test fun `palettes have the same size in both themes`() {
        assertThat(RainbowLetters.paletteHex(true)).hasSize(6)
        assertThat(RainbowLetters.paletteHex(false)).hasSize(6)
    }

    @Test fun `seed exists only when the rainbow is on`() {
        assertThat(RainbowLetters.seed(true, "m-9")).isEqualTo("m-9")
        assertThat(RainbowLetters.seed(false, "m-9")).isNull()
    }

    @Test fun `letters skip whitespace links and mentions`() {
        val segments = listOf(
            MessageSegment.Text("ab "),
            MessageSegment.MentionLink("@c", "c", "https://meeshy.me/u/c"),
            MessageSegment.Text(" d"),
        )
        val letters = RainbowLetters.letters(segments, "m", 6)
        assertThat(letters.map { it.segment to it.start }).containsExactly(0 to 0, 0 to 1, 2 to 1).inOrder()
        assertThat(letters.map { it.colorIndex }).isEqualTo(RainbowLetters.colorIndices(3, "m", 6))
    }

    @Test fun `an emoji sequence is one letter`() {
        val letters = RainbowLetters.letters(listOf(MessageSegment.Text("👨‍💻")), "m", 6)
        assertThat(letters).hasSize(1)
    }
}
