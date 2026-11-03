package me.meeshy.sdk.model.media

import me.meeshy.sdk.model.fileviewer.CodeLanguage

/** Les treize sortes de morceaux de code, dans l'ordre de `SyntaxTokenType` (iOS). */
enum class SyntaxTokenType {
    PLAIN, KEYWORD, STRING, COMMENT, NUMBER, TYPE, FUNCTION, PREPROCESSOR, OPERATOR, PROPERTY, ATTRIBUTE, TAG, PUNCTUATION,
}

/** Un morceau d'une ligne de code, avec la sorte qui décide de sa couleur. */
data class SyntaxToken(val text: String, val type: SyntaxTokenType)

/**
 * Le lexeur de coloration (miroir de `SyntaxHighlighter`, iOS) : une passe, linéaire, sans expression régulière — son
 * coût est borné sur n'importe quel texte reçu. Il rend UNE liste de morceaux par ligne ; la concaténation des
 * morceaux d'une ligne redonne cette ligne. Les commentaires de bloc (imbriqués là où le langage les imbrique) et les
 * chaînes sur plusieurs lignes (triples guillemets, gabarits entre apostrophes inversées) portent d'une ligne à l'autre.
 */
object SyntaxHighlighter {

    fun tokenize(code: String, language: CodeLanguage): List<List<SyntaxToken>> {
        val lexer = LineLexer(SyntaxLanguageDefinition.of(language))
        return code.split('\n').map { lexer.lex(it.trimEnd('\r')) }
    }
}

private const val OPERATORS = "+-*/%=!<>&|^~?:"
private const val PUNCTUATION = "()[]{},;."
private const val MARKUP_PUNCTUATION = "<>/="

private class LineLexer(private val def: SyntaxLanguageDefinition) {
    private var blockDepth = 0
    private var openString: String? = null
    private var braceDepth = 0

    fun lex(line: String): List<SyntaxToken> {
        val out = ArrayList<SyntaxToken>()
        var i = 0
        while (i < line.length) {
            i = when {
                blockDepth > 0 -> scanBlock(line, i, i, out)
                openString != null -> scanOpenString(line, i, out)
                else -> step(line, i, out)
            }
        }
        return out
    }

    private fun add(out: MutableList<SyntaxToken>, text: String, type: SyntaxTokenType) {
        val last = out.lastOrNull()
        if (type == SyntaxTokenType.PLAIN && last != null && last.type == SyntaxTokenType.PLAIN) {
            out[out.lastIndex] = SyntaxToken(last.text + text, type)
        } else {
            out += SyntaxToken(text, type)
        }
    }

    private fun step(line: String, i: Int, out: MutableList<SyntaxToken>): Int {
        val c = line[i]
        return when {
            startsBlockComment(line, i) -> startBlock(line, i, out)
            def.lineComment != null && line.startsWith(def.lineComment, i) -> consume(line, i, line.length, SyntaxTokenType.COMMENT, out)
            def.tripleQuotes && (line.startsWith("\"\"\"", i) || line.startsWith("'''", i)) -> startMultiLineString(line, i, line.substring(i, i + 3), 3, out)
            def.backtickStrings && c == '`' -> startMultiLineString(line, i, "`", 1, out)
            def.rustChars && c == '\'' -> rustChar(line, i, out)
            c in def.quotes -> quoted(line, i, out)
            def.preprocessorPrefix != null && line.startsWith(def.preprocessorPrefix, i) && line.substring(0, i).isBlank() -> preprocessor(line, i, out)
            def.markup && c == '<' -> openTag(line, i, out)
            def.css && c == '#' && hexRun(line, i + 1) in setOf(3, 4, 6, 8) -> consume(line, i, i + 1 + hexRun(line, i + 1), SyntaxTokenType.NUMBER, out)
            c.isDigit() || (c == '.' && i + 1 < line.length && line[i + 1].isDigit()) -> number(line, i, out)
            c.isLetter() || c == '_' || c == '@' || c == '$' -> word(line, i, out)
            else -> symbol(line, i, out)
        }
    }

    private fun consume(line: String, from: Int, to: Int, type: SyntaxTokenType, out: MutableList<SyntaxToken>): Int {
        add(out, line.substring(from, to), type)
        return to
    }

    private fun startsBlockComment(line: String, i: Int): Boolean {
        val block = def.blockComment ?: return false
        if (!line.startsWith(block.first, i)) return false
        return block.first != "=begin" || i == 0
    }

    private fun startBlock(line: String, i: Int, out: MutableList<SyntaxToken>): Int {
        blockDepth = 1
        return scanBlock(line, i, i + def.blockComment!!.first.length, out)
    }

    private fun scanBlock(line: String, from: Int, scanFrom: Int, out: MutableList<SyntaxToken>): Int {
        val (open, close) = def.blockComment!!
        var j = scanFrom
        while (j < line.length) {
            when {
                def.nestedBlockComments && line.startsWith(open, j) -> { blockDepth++; j += open.length }
                line.startsWith(close, j) -> {
                    blockDepth--
                    j += close.length
                    if (blockDepth == 0) return consume(line, from, j, SyntaxTokenType.COMMENT, out)
                }
                else -> j++
            }
        }
        return consume(line, from, line.length, SyntaxTokenType.COMMENT, out)
    }

    private fun startMultiLineString(line: String, i: Int, delimiter: String, width: Int, out: MutableList<SyntaxToken>): Int {
        openString = delimiter
        return scanOpenString(line, i, out, i + width)
    }

    private fun scanOpenString(line: String, from: Int, out: MutableList<SyntaxToken>, scanFrom: Int = from): Int {
        val delimiter = openString!!
        var j = scanFrom
        while (j < line.length) {
            when {
                line[j] == '\\' -> j += 2
                line.startsWith(delimiter, j) -> {
                    openString = null
                    return consume(line, from, j + delimiter.length, SyntaxTokenType.STRING, out)
                }
                else -> j++
            }
        }
        return consume(line, from, line.length, SyntaxTokenType.STRING, out)
    }

    private fun quoted(line: String, i: Int, out: MutableList<SyntaxToken>): Int {
        val quote = line[i]
        var j = i + 1
        while (j < line.length && line[j] != quote) j += if (line[j] == '\\') 2 else 1
        val end = if (j < line.length) j + 1 else line.length
        val type = if (def.jsonKeys && nextNonSpace(line, end) == ':') SyntaxTokenType.PROPERTY else SyntaxTokenType.STRING
        return consume(line, i, end, type, out)
    }

    private fun rustChar(line: String, i: Int, out: MutableList<SyntaxToken>): Int {
        val escaped = i + 1 < line.length && line[i + 1] == '\\'
        val close = when {
            escaped -> line.indexOf('\'', i + 3).takeIf { it >= 0 }
            i + 2 < line.length && line[i + 2] == '\'' -> i + 2
            else -> null
        } ?: return consume(line, i, i + 1, SyntaxTokenType.PLAIN, out)
        return consume(line, i, close + 1, SyntaxTokenType.STRING, out)
    }

    private fun preprocessor(line: String, i: Int, out: MutableList<SyntaxToken>): Int {
        var j = i + def.preprocessorPrefix!!.length
        while (j < line.length && (line[j].isLetterOrDigit() || line[j] == '_')) j++
        return consume(line, i, j, SyntaxTokenType.PREPROCESSOR, out)
    }

    private fun openTag(line: String, i: Int, out: MutableList<SyntaxToken>): Int {
        var j = i + 1
        if (j < line.length && line[j] in "/!?") j++
        add(out, line.substring(i, j), SyntaxTokenType.PUNCTUATION)
        val nameStart = j
        while (j < line.length && (line[j].isLetterOrDigit() || line[j] in "-_:.")) j++
        if (j > nameStart && line[nameStart].isLetter()) add(out, line.substring(nameStart, j), SyntaxTokenType.TAG) else j = nameStart
        return j
    }

    private fun hexRun(line: String, from: Int): Int {
        var j = from
        while (j < line.length && (line[j] in '0'..'9' || line[j] in 'a'..'f' || line[j] in 'A'..'F')) j++
        return j - from
    }

    private fun number(line: String, i: Int, out: MutableList<SyntaxToken>): Int {
        var j = i
        val prefixed = line.startsWith("0x", i, true) || line.startsWith("0b", i, true)
        if (prefixed) {
            val binary = line[i + 1] in "bB"
            j += 2
            while (j < line.length && (line[j] == '_' || (if (binary) line[j] in "01" else hexRun(line, j) > 0))) j++
        } else {
            while (j < line.length && (line[j].isDigit() || line[j] in "._eE")) j++
        }
        while (j < line.length && line[j].isLetter()) j++
        return consume(line, i, j, SyntaxTokenType.NUMBER, out)
    }

    private fun nextNonSpace(line: String, from: Int): Char? {
        var j = from
        while (j < line.length && line[j] == ' ') j++
        return line.getOrNull(j)
    }

    private fun word(line: String, i: Int, out: MutableList<SyntaxToken>): Int {
        var j = i
        if (line[j] == '@' || line[j] == '$') j++
        val dashed = def.markup || def.css || def.keyColon
        while (j < line.length && (line[j].isLetterOrDigit() || line[j] == '_' || (dashed && line[j] == '-'))) j++
        if (def.rubyIdentifiers && j < line.length && line[j] in "?!" && line.getOrNull(j + 1) != '=') j++
        consume(line, i, j, classify(line, i, j, out), out)
        return j
    }

    private fun classify(line: String, start: Int, end: Int, out: List<SyntaxToken>): SyntaxTokenType {
        val word = line.substring(start, end)
        if (def.markup) return if (line.getOrNull(end) == '=') SyntaxTokenType.PROPERTY else SyntaxTokenType.PLAIN
        val isCall = nextNonSpace(line, end) == '('
        val member = start > 0 && line[start - 1] == '.'
        return when {
            member && !isCall -> SyntaxTokenType.PROPERTY
            isKey(line, end, out) -> SyntaxTokenType.PROPERTY
            word in def.keywords -> SyntaxTokenType.KEYWORD
            word.startsWith("@") -> SyntaxTokenType.ATTRIBUTE
            word in def.typeWords -> SyntaxTokenType.TYPE
            isCall || word in def.builtins -> SyntaxTokenType.FUNCTION
            word.first().isUpperCase() -> SyntaxTokenType.TYPE
            else -> SyntaxTokenType.PLAIN
        }
    }

    private fun isKey(line: String, end: Int, out: List<SyntaxToken>): Boolean = when {
        def.keyColon -> line.getOrNull(end) == ':' && (end + 1 >= line.length || line[end + 1] == ' ')
        def.keyEquals -> nextNonSpace(line, end) == '=' && out.all { it.type == SyntaxTokenType.PLAIN }
        def.css -> braceDepth > 0 && line.getOrNull(end) == ':' && line.getOrNull(end + 1) != ':'
        else -> false
    }

    private fun symbol(line: String, i: Int, out: MutableList<SyntaxToken>): Int {
        val c = line[i]
        return when {
            def.markup && c in MARKUP_PUNCTUATION -> consume(line, i, i + 1, SyntaxTokenType.PUNCTUATION, out)
            c in OPERATORS -> {
                var j = i
                while (j < line.length && line[j] in OPERATORS) j++
                consume(line, i, j, SyntaxTokenType.OPERATOR, out)
            }
            c in PUNCTUATION -> {
                if (def.css && c == '{') braceDepth++
                if (def.css && c == '}') braceDepth = maxOf(0, braceDepth - 1)
                consume(line, i, i + 1, SyntaxTokenType.PUNCTUATION, out)
            }
            else -> consume(line, i, i + 1, SyntaxTokenType.PLAIN, out)
        }
    }
}
