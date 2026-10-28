package me.meeshy.sdk.model.fileviewer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.fileviewer.CodeToken.Kind
import org.junit.Test

class SyntaxTokenizerTest {

    private fun kinds(line: List<CodeToken>) = line.filter { it.kind != Kind.PLAIN }.map { it.kind to it.text }

    @Test
    fun `une ligne par ligne du source et le texte se recompose a l'identique`() {
        val code = "fun main() {\n    val x = 42 // fin\n}"
        val lines = SyntaxTokenizer.tokenize(code, CodeLanguage.KOTLIN)
        assertThat(lines).hasSize(3)
        assertThat(lines.map { line -> line.joinToString("") { it.text } }).containsExactly("fun main() {", "    val x = 42 // fin", "}").inOrder()
    }

    @Test
    fun `reconnait mot-cle nombre et commentaire`() {
        val line = SyntaxTokenizer.tokenize("val x = 42 // fin", CodeLanguage.KOTLIN).single()
        assertThat(kinds(line)).containsExactly(Kind.KEYWORD to "val", Kind.NUMBER to "42", Kind.COMMENT to "// fin").inOrder()
    }

    @Test
    fun `une chaine garde ses guillemets et son echappement`() {
        val line = SyntaxTokenizer.tokenize("""print("a\"b", 'c')""", CodeLanguage.PYTHON).single()
        assertThat(kinds(line)).containsExactly(Kind.STRING to "\"a\\\"b\"", Kind.STRING to "'c'").inOrder()
    }

    @Test
    fun `un commentaire de bloc court sur plusieurs lignes`() {
        val lines = SyntaxTokenizer.tokenize("a /* x\ny */ b", CodeLanguage.C)
        assertThat(kinds(lines[0])).containsExactly(Kind.COMMENT to "/* x")
        assertThat(kinds(lines[1])).containsExactly(Kind.COMMENT to "y */")
    }

    @Test
    fun `un mot contenu dans un identifiant n'est pas un mot-cle`() {
        val line = SyntaxTokenizer.tokenize("value", CodeLanguage.KOTLIN).single()
        assertThat(kinds(line)).isEmpty()
    }

    @Test
    fun `le dieze commente en shell et python`() {
        assertThat(kinds(SyntaxTokenizer.tokenize("# note", CodeLanguage.SHELL).single())).containsExactly(Kind.COMMENT to "# note")
    }

    @Test
    fun `le json colore ses litteraux`() {
        val line = SyntaxTokenizer.tokenize("""{"a": true, "b": null}""", CodeLanguage.JSON).single()
        assertThat(kinds(line)).containsExactly(
            Kind.STRING to "\"a\"", Kind.KEYWORD to "true", Kind.STRING to "\"b\"", Kind.KEYWORD to "null",
        ).inOrder()
    }

    @Test
    fun `un texte vide donne une ligne vide`() {
        assertThat(SyntaxTokenizer.tokenize("", CodeLanguage.KOTLIN)).hasSize(1)
    }
}
