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
 * pas devenir un million de lignes de liste. L'analyse est LINÉAIRE et sans expression régulière à retours arrière
 * sur le texte d'un bloc : une ligne hostile de 512 Kio (crochets jamais fermés, titre suivi d'un blanc immense,
 * cible de lien démesurée) ne gèle ni ne fait déborder la pile ; le texte d'un bloc est écrêté à [MAX_BLOCK_CHARS].
 */
object MarkdownBlocks {
    const val MAX_BLOCKS = 5_000

    /** La borne du texte d'un bloc : celle des lignes de la vue source, au-delà le bloc finit par « … ». */
    const val MAX_BLOCK_CHARS = 4_000

    private val bullet = Regex("^(\\s*)[-*+]\\s+(.*)$")
    private val numbered = Regex("^(\\s*)(\\d{1,9})[.)]\\s+(.*)$")
    private val rule = Regex("^\\s{0,3}([-*_])(\\s*\\1){2,}\\s*$")
    private val fence = Regex("^\\s{0,3}```")

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
                headingOf(line) != null -> {
                    flush()
                    val (level, content) = headingOf(line)!!
                    blocks += MarkdownBlock.Heading(level, spans(content))
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

    private fun isBlank(c: Char): Boolean = c == ' ' || c == '\t' || c == '\u000B' || c == '\u000C'

    /** `#`×1…6, au moins un blanc, puis le texte sans sa séquence fermante (`## Titre ##` → « Titre »). */
    private fun headingOf(line: String): Pair<Int, String>? {
        val level = line.takeWhile { it == '#' }.length
        if (level !in 1..6 || level >= line.length || !isBlank(line[level])) return null
        val content = line.substring(level).trimStart(::isBlank).trimEnd(::isBlank).trimEnd('#').trimEnd(::isBlank)
        return level to content
    }

    private fun clipped(raw: String): String =
        if (raw.length > MAX_BLOCK_CHARS) raw.take(MAX_BLOCK_CHARS) + "…" else raw

    /**
     * `[libellé](cible)` → « libellé (cible) » (ou « libellé » sans cible), en un passage LINÉAIRE : la fin d'un libellé
     * et la fin d'une cible sont lues dans deux tables calculées de droite à gauche, jamais par un balayage répété.
     */
    private fun flattenLinks(text: String): String {
        val n = text.length
        val closeOrBreak = IntArray(n + 1) { n }
        val nextParenOrBlank = IntArray(n + 1) { n }
        for (k in n - 1 downTo 0) {
            val c = text[k]
            closeOrBreak[k] = if (c == ']' || c == '\n') k else closeOrBreak[k + 1]
            nextParenOrBlank[k] = if (c == '(' || c == ')' || c.isWhitespace()) k else nextParenOrBlank[k + 1]
        }
        // bodyEnd[k] : l'indice du `)` qui ferme une cible dont le corps reprend en k (un niveau de parenthèses
        // équilibrées, aucun blanc), sinon -1.
        val bodyEnd = IntArray(n + 1) { -1 }
        for (k in n - 1 downTo 0) {
            val c = text[k]
            bodyEnd[k] = when {
                c == ')' -> k
                c.isWhitespace() -> -1
                c == '(' -> {
                    val m = nextParenOrBlank[k + 1]
                    if (m < n && text[m] == ')') bodyEnd[m + 1] else -1
                }
                else -> bodyEnd[k + 1]
            }
        }
        val out = StringBuilder(n)
        var i = 0
        while (i < n) {
            if (text[i] == '[') {
                val close = closeOrBreak[i + 1]
                val end = if (close + 1 < n && text[close] == ']' && text[close + 1] == '(') bodyEnd[close + 2] else -1
                if (end >= 0) {
                    val label = text.substring(i + 1, close)
                    val target = text.substring(close + 2, end)
                    out.append(if (target.isEmpty()) label else "$label ($target)")
                    i = end + 1
                    continue
                }
            }
            out.append(text[i])
            i++
        }
        return out.toString()
    }

    private fun spans(raw: String): List<MarkdownSpan> {
        val flattened = flattenLinks(clipped(raw))
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
