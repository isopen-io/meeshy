package me.meeshy.sdk.model.comment

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommentDraftBookTest {

    @Test
    fun `un brouillon ecrit se relit`() {
        val book = CommentDraftBook().saved("p1", "bonjour")
        assertThat(book.load("p1")).isEqualTo("bonjour")
    }

    @Test
    fun `un texte vide efface le brouillon`() {
        val book = CommentDraftBook().saved("p1", "bonjour").saved("p1", "   ")
        assertThat(book.load("p1")).isNull()
        assertThat(book.size).isEqualTo(0)
    }

    @Test
    fun `le plafond de cinquante chasse le plus ancien`() {
        val book = (1..51).fold(CommentDraftBook()) { acc, i -> acc.saved("p$i", "t$i") }
        assertThat(book.size).isEqualTo(CommentDraftBook.MAX_DRAFTS)
        assertThat(book.load("p1")).isNull()
        assertThat(book.load("p2")).isEqualTo("t2")
        assertThat(book.load("p51")).isEqualTo("t51")
    }

    @Test
    fun `reecrire un brouillon le replace en tete de l'ordre`() {
        val book = (1..50).fold(CommentDraftBook()) { acc, i -> acc.saved("p$i", "t$i") }
            .saved("p1", "neuf")
            .saved("p51", "t51")
        assertThat(book.load("p1")).isEqualTo("neuf")
        assertThat(book.load("p2")).isNull()
    }

    @Test
    fun `effacer un post inconnu ne change rien`() {
        val book = CommentDraftBook().saved("p1", "a")
        assertThat(book.cleared("p2")).isSameInstanceAs(book)
    }

    @Test
    fun `un identifiant de post vide est ignore`() {
        assertThat(CommentDraftBook().saved(" ", "a").size).isEqualTo(0)
    }

    @Test
    fun `les entrees se reconstruisent dans l'ordre`() {
        val book = CommentDraftBook().saved("a", "1").saved("b", "2")
        assertThat(CommentDraftBook.of(book.entries())).isEqualTo(book)
    }
}
