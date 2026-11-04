package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.fileviewer.CodeLanguage
import me.meeshy.sdk.model.media.SyntaxTokenType.ATTRIBUTE
import me.meeshy.sdk.model.media.SyntaxTokenType.COMMENT
import me.meeshy.sdk.model.media.SyntaxTokenType.FUNCTION
import me.meeshy.sdk.model.media.SyntaxTokenType.KEYWORD
import me.meeshy.sdk.model.media.SyntaxTokenType.NUMBER
import me.meeshy.sdk.model.media.SyntaxTokenType.PREPROCESSOR
import me.meeshy.sdk.model.media.SyntaxTokenType.PROPERTY
import me.meeshy.sdk.model.media.SyntaxTokenType.STRING
import me.meeshy.sdk.model.media.SyntaxTokenType.TAG
import me.meeshy.sdk.model.media.SyntaxTokenType.TYPE
import org.junit.Test

class SyntaxHighlighterTest {

    private fun line(code: String, language: CodeLanguage, index: Int = 0) = SyntaxHighlighter.tokenize(code, language)[index]

    private fun typed(code: String, language: CodeLanguage, index: Int = 0): List<Pair<SyntaxTokenType, String>> =
        line(code, language, index).filter { it.type != SyntaxTokenType.PLAIN && it.type != SyntaxTokenType.PUNCTUATION && it.type != SyntaxTokenType.OPERATOR }
            .map { it.type to it.text }

    @Test
    fun `chaque ligne se recompose a l'identique`() {
        val code = "def f(x):\n    return x + 1  # fin\n"
        val lines = SyntaxHighlighter.tokenize(code, CodeLanguage.PYTHON)
        assertThat(lines.map { l -> l.joinToString("") { it.text } }).containsExactly("def f(x):", "    return x + 1  # fin", "").inOrder()
    }

    @Test
    fun `python mot-cle fonction nombre et commentaire`() {
        assertThat(typed("def add(a): return 42 # ok", CodeLanguage.PYTHON))
            .containsExactly(KEYWORD to "def", FUNCTION to "add", KEYWORD to "return", NUMBER to "42", COMMENT to "# ok").inOrder()
    }

    @Test
    fun `python chaine triple sur plusieurs lignes`() {
        val lines = SyntaxHighlighter.tokenize("x = \"\"\"a\nb # pas un commentaire\nc\"\"\" + 1", CodeLanguage.PYTHON)
        assertThat(lines[1].single().type).isEqualTo(STRING)
        assertThat(lines[2].first().type).isEqualTo(STRING)
        assertThat(lines[2].first().text).isEqualTo("c\"\"\"")
        assertThat(lines[2].last().type).isEqualTo(NUMBER)
    }

    @Test
    fun `javascript gabarit backtick sur plusieurs lignes et types`() {
        val lines = SyntaxHighlighter.tokenize("const s = `a\nb`; let n: string", CodeLanguage.TYPESCRIPT)
        assertThat(lines[0].last().type).isEqualTo(STRING)
        assertThat(lines[1].first().text).isEqualTo("b`")
        assertThat(lines[1].first().type).isEqualTo(STRING)
        assertThat(typed("let n: string", CodeLanguage.TYPESCRIPT)).containsExactly(KEYWORD to "let", TYPE to "string").inOrder()
    }

    @Test
    fun `swift directive de preprocesseur et attribut`() {
        assertThat(typed("#if DEBUG", CodeLanguage.SWIFT)).contains(PREPROCESSOR to "#if")
        assertThat(typed("@MainActor func go()", CodeLanguage.SWIFT)).containsAtLeast(ATTRIBUTE to "@MainActor", KEYWORD to "func")
    }

    @Test
    fun `rust commentaires de bloc imbriques`() {
        val lines = SyntaxHighlighter.tokenize("/* a /* b */ still\nfn */ fn x", CodeLanguage.RUST)
        assertThat(lines[0].single().type).isEqualTo(COMMENT)
        assertThat(lines[1].first().type).isEqualTo(COMMENT)
        assertThat(lines[1].first().text).isEqualTo("fn */")
        assertThat(lines[1].any { it.type == KEYWORD && it.text == "fn" }).isTrue()
    }

    @Test
    fun `rust duree de vie n'est pas une chaine`() {
        assertThat(typed("fn f<'a>(x: &'a str)", CodeLanguage.RUST).none { it.first == STRING }).isTrue()
    }

    @Test
    fun `c ne reconnait pas les commentaires imbriques`() {
        val lines = SyntaxHighlighter.tokenize("/* a /* b */ int", CodeLanguage.C)
        assertThat(lines[0].first().text).isEqualTo("/* a /* b */")
        assertThat(lines[0].last().type).isEqualTo(KEYWORD)
    }

    @Test
    fun `go kotlin et java reconnaissent leurs mots-cles et types`() {
        assertThat(typed("func main()", CodeLanguage.GO)).containsExactly(KEYWORD to "func", FUNCTION to "main").inOrder()
        assertThat(typed("val s: String = \"x\"", CodeLanguage.KOTLIN)).containsExactly(KEYWORD to "val", TYPE to "String", STRING to "\"x\"").inOrder()
        assertThat(typed("public static void main", CodeLanguage.JAVA)).containsExactly(KEYWORD to "public", KEYWORD to "static", TYPE to "void").inOrder()
    }

    @Test
    fun `ruby commentaire begin end sur plusieurs lignes`() {
        val lines = SyntaxHighlighter.tokenize("=begin\nnote\n=end\nputs 1", CodeLanguage.RUBY)
        assertThat(lines.take(3).all { l -> l.all { it.type == COMMENT } }).isTrue()
        assertThat(lines[3].first().type).isEqualTo(KEYWORD)
    }

    @Test
    fun `shell variable commentaire et mot-cle`() {
        assertThat(typed("if [ -f x ]; then # test", CodeLanguage.SHELL)).containsExactly(KEYWORD to "if", KEYWORD to "then", COMMENT to "# test").inOrder()
    }

    @Test
    fun `sql majuscules et minuscules`() {
        assertThat(typed("select count(*) from t where id = 'a' -- c", CodeLanguage.SQL).map { it.first })
            .containsAtLeast(KEYWORD, FUNCTION, STRING, COMMENT)
        assertThat(typed("SELECT 1", CodeLanguage.SQL)).containsExactly(KEYWORD to "SELECT", NUMBER to "1").inOrder()
    }

    @Test
    fun `html balises et attributs`() {
        assertThat(typed("<div class=\"a\">", CodeLanguage.HTML)).containsExactly(TAG to "div", PROPERTY to "class", STRING to "\"a\"").inOrder()
        assertThat(typed("</div>", CodeLanguage.HTML)).containsExactly(TAG to "div")
    }

    @Test
    fun `css propriete dans un bloc`() {
        val lines = SyntaxHighlighter.tokenize("a {\n  color: red;\n}", CodeLanguage.CSS)
        assertThat(lines[1].any { it.type == PROPERTY && it.text == "color" }).isTrue()
    }

    @Test
    fun `json cle en propriete et litteraux en mots-cles`() {
        assertThat(typed("{\"a\": true, \"b\": \"x\"}", CodeLanguage.JSON))
            .containsExactly(PROPERTY to "\"a\"", KEYWORD to "true", PROPERTY to "\"b\"", STRING to "\"x\"").inOrder()
    }

    @Test
    fun `yaml cle en propriete`() {
        assertThat(typed("name: true # c", CodeLanguage.YAML)).containsExactly(PROPERTY to "name", KEYWORD to "true", COMMENT to "# c").inOrder()
    }

    @Test
    fun `php et ruby et objective c ont leur famille`() {
        assertThat(typed("echo \$x; // c", CodeLanguage.PHP).map { it.first }).containsAtLeast(KEYWORD, COMMENT)
        assertThat(typed("#import <a.h>", CodeLanguage.OBJECTIVE_C)).contains(PREPROCESSOR to "#import")
        assertThat(typed("def go; end", CodeLanguage.RUBY).map { it.first }).containsAtLeast(KEYWORD, KEYWORD)
    }

    @Test
    fun `acces de membre est une propriete`() {
        assertThat(typed("a.size", CodeLanguage.KOTLIN)).containsExactly(PROPERTY to "size")
    }

    @Test
    fun `entree hostile ne boucle pas`() {
        val hostile = "\$\$\$ @@ ### ''' \"\"\" ` /* <<< \u0000 😀 0x 0b"
        CodeLanguage.entries.forEach { SyntaxHighlighter.tokenize(hostile, it) }
        assertThat(SyntaxHighlighter.tokenize("", CodeLanguage.C)).hasSize(1)
    }
}
