package me.meeshy.app.chat.export

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CardTextTest {

    private val font = CardFont(CardFace.Native(400, false), 10.0)
    private val measure: CardMeasure = { text, _ -> text.length * 10.0 }

    @Test
    fun `a text is cut into lines that fit and the author's line breaks are kept`() {
        assertThat(CardText.wrap("aaa bbb ccc", 70.0, font, measure)).containsExactly("aaa bbb", "ccc").inOrder()
        assertThat(CardText.wrap("one\ntwo", 500.0, font, measure)).containsExactly("one", "two").inOrder()
    }

    @Test
    fun `a word wider than the line is cut by character instead of overflowing`() {
        assertThat(CardText.wrap("abcdefghij", 40.0, font, measure)).containsExactly("abcd", "efgh", "ij").inOrder()
    }

    @Test
    fun `leading and trailing blank lines go and two blank lines in a row make one`() {
        assertThat(CardText.wrap("\n\na\n\n\n\nb\n\n", 500.0, font, measure)).containsExactly("a", "", "b").inOrder()
    }

    @Test
    fun `truncation keeps the first lines and ends the last with an ellipsis that fits`() {
        val lines = listOf("aaaaaaaa", "bbbbbbbb", "cccccccc")
        val cut = CardText.truncate(lines, count = 2, maxWidth = 50.0, font = font, measure = measure)
        assertThat(cut).hasSize(2)
        assertThat(cut[1]).isEqualTo("bbbb…")
        assertThat(measure(cut[1], font)).isAtMost(50.0)
        assertThat(CardText.truncate(lines, 5, 50.0, font, measure)).isEqualTo(lines)
    }

    @Test
    fun `the direction is that of the first strong character`() {
        assertThat(CardText.direction("Bonjour")).isEqualTo(CardTextDirection.LTR)
        assertThat(CardText.direction("123 مرحبا")).isEqualTo(CardTextDirection.RTL)
        assertThat(CardText.direction("  !! שלום")).isEqualTo(CardTextDirection.RTL)
        assertThat(CardText.direction("1234")).isEqualTo(CardTextDirection.LTR)
    }

    @Test
    fun `a blank value is no value`() {
        assertThat(CardText.nonBlank("  ")).isNull()
        assertThat(CardText.nonBlank(null)).isNull()
        assertThat(CardText.nonBlank(" a ")).isEqualTo("a")
    }
}
