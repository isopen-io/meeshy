package me.meeshy.sdk.model.fileviewer

/** Un fragment de texte en ligne : jamais de lien actif, jamais de HTML — le libellé seul. */
data class MarkdownSpan(
    val text: String,
    val bold: Boolean = false,
    val italic: Boolean = false,
    val code: Boolean = false,
)

sealed interface MarkdownBlock {
    data class Heading(val level: Int, val spans: List<MarkdownSpan>) : MarkdownBlock
    data class Paragraph(val spans: List<MarkdownSpan>) : MarkdownBlock
    data class ListItem(val number: Int?, val depth: Int, val spans: List<MarkdownSpan>) : MarkdownBlock
    data class Quote(val spans: List<MarkdownSpan>) : MarkdownBlock
    data class CodeBlock(val text: String) : MarkdownBlock
    data object Rule : MarkdownBlock
}

/**
 * Le Markdown d'un fichier reçu, réduit à ce qu'on peut LIRE sans rien exécuter : titres, paragraphes, listes,
 * citations, blocs de code, règles, et gras / italique / code en ligne. Pas de HTML (gardé tel quel, comme du texte),
 * pas d'image, pas de lien actif (le libellé est suivi de sa cible, écrite en clair), pas de tableau. Le nombre de
 * blocs est borné : le texte d'entrée l'est déjà (512 Kio) mais un fichier d'un million de lignes vides ne doit
 * pas devenir un million de lignes de liste.
 */
object MarkdownBlocks {
    const val MAX_BLOCKS = 5_000

    private val heading = Regex("^(#{1,6})\\s+(.*?)\\s*#*\\s*$")
    private val bullet = Regex("^(\\s*)[-*+]\\s+(.*)$")
    private val numbered = Regex("^(\\s*)(\\d{1,9})[.)]\\s+(.*)$")
    private val rule = Regex("^\\s{0,3}([-*_])(\\s*\\1){2,}\\s*$")
    private val fence = Regex("^\\s{0,3}```")
    private val link = Regex("\\[([^\\]\\n]*)]\\(((?:[^()\\s]|\\([^()\\s]*\\))*)\\)")

    fun parse(text: String): List<MarkdownBlock> {
        val blocks = mutableListOf<MarkdownBlock>()
        val paragraph = mutableListOf<String>()
        fun flush() {
            if (paragraph.isNotEmpty()) blocks += MarkdownBlock.Paragraph(spans(paragraph.joinToString(" ")))
            paragraph.clear()
        }
        val lines = text.replace("\r\n", "\n").replace('\r', '\n').split('\n')
        var index = 0
        while (index < lines.size && blocks.size < MAX_BLOCKS) {
            val line = lines[index]
            when {
                fence.containsMatchIn(line) -> {
                    flush()
                    val code = mutableListOf<String>()
                    index++
                    while (index < lines.size && !fence.containsMatchIn(lines[index])) code += lines[index++]
                    blocks += MarkdownBlock.CodeBlock(code.joinToString("\n"))
                }
                line.isBlank() -> flush()
                rule.matches(line) -> { flush(); blocks += MarkdownBlock.Rule }
                heading.matches(line) -> {
                    flush()
                    val match = heading.matchEntire(line)!!
                    blocks += MarkdownBlock.Heading(match.groupValues[1].length, spans(match.groupValues[2]))
                }
                line.trimStart().startsWith(">") -> {
                    flush()
                    blocks += MarkdownBlock.Quote(spans(line.trimStart().removePrefix(">").trim()))
                }
                bullet.matches(line) -> {
                    flush()
                    val match = bullet.matchEntire(line)!!
                    blocks += MarkdownBlock.ListItem(null, depth(match.groupValues[1]), spans(match.groupValues[2]))
                }
                numbered.matches(line) -> {
                    flush()
                    val match = numbered.matchEntire(line)!!
                    val number = match.groupValues[2].toIntOrNull() ?: 1
                    blocks += MarkdownBlock.ListItem(number, depth(match.groupValues[1]), spans(match.groupValues[3]))
                }
                else -> paragraph += line.trim()
            }
            index++
        }
        if (blocks.size < MAX_BLOCKS) flush()
        return blocks
    }

    private fun depth(indent: String): Int = (indent.replace("\t", "  ").length / 2).coerceAtMost(6)

    private fun spans(raw: String): List<MarkdownSpan> {
        val flattened = link.replace(raw) { m ->
            val target = m.groupValues[2]
            if (target.isEmpty()) m.groupValues[1] else "${m.groupValues[1]} ($target)"
        }
        val out = mutableListOf<MarkdownSpan>()
        val plain = StringBuilder()
        fun emitPlain() {
            if (plain.isNotEmpty()) out += MarkdownSpan(plain.toString())
            plain.setLength(0)
        }
        var i = 0
        while (i < flattened.length) {
            val inline = inlineAt(flattened, i)
            if (inline != null) {
                emitPlain()
                out += inline.span
                i = inline.next
            } else {
                plain.append(flattened[i])
                i++
            }
        }
        emitPlain()
        return out
    }

    private class Inline(val span: MarkdownSpan, val next: Int)

    /** Un gras, un italique ou un code qui COMMENCE en [at] et se ferme sur la ligne ; sinon `null` (texte). */
    private fun inlineAt(text: String, at: Int): Inline? {
        val marker = when {
            text.startsWith("`", at) -> "`"
            text.startsWith("**", at) -> "**"
            text.startsWith("*", at) -> "*"
            else -> return null
        }
        val start = at + marker.length
        if (start >= text.length) return null
        if (marker != "`" && text[start].isWhitespace()) return null
        val end = text.indexOf(marker, start)
        if (end <= start) return null
        if (marker != "`" && text[end - 1].isWhitespace()) return null
        val inner = text.substring(start, end)
        val span = when (marker) {
            "`" -> MarkdownSpan(inner, code = true)
            "**" -> MarkdownSpan(inner, bold = true)
            else -> MarkdownSpan(inner, italic = true)
        }
        return Inline(span, end + marker.length)
    }
}
