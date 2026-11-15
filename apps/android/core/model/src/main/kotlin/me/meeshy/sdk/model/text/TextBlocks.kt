package me.meeshy.sdk.model.text

/**
 * The blocks of a message — headings, lists, quotes and code blocks, split LINE
 * BY LINE. Mirror of `parseBlocks` (`packages/shared/utils/text-blocks.ts`) and
 * iOS `MessageBlockParser`: same syntax, same cases.
 */
sealed interface TextBlock {
    data class Paragraph(val text: String) : TextBlock
    data class Heading(val level: Int, val text: String) : TextBlock
    data class ListBlock(val ordered: Boolean, val start: Int, val items: List<String>) : TextBlock
    data class Quote(val text: String) : TextBlock
    data class Code(val language: String?, val text: String) : TextBlock
}

/**
 * Silent by default: a text without block syntax is ONE paragraph identical to
 * its input ([hasBlockSyntax] is the fast path a renderer checks first). Three
 * heading levels (`#` to `###` followed by a space, so `#projet` stays a
 * hashtag), `-`/`*`/`+` bullets, `1.`/`1)` lists, `>` quotes and ``` fences.
 */
object TextBlocks {

    private val heading = Regex("""^(#{1,3})[ \t]+(\S.*)$""")
    private val bullet = Regex("""^[ \t]{0,3}[-*+][ \t]+(\S.*)$""")
    private val ordered = Regex("""^[ \t]{0,3}(\d{1,9})[.)][ \t]+(\S.*)$""")
    private val quote = Regex("""^[ \t]{0,3}>[ \t]?(.*)$""")
    private val fence = Regex("""^[ \t]{0,3}```[ \t]*([\w+#.-]*)[ \t]*$""")
    private val closingFence = Regex("""^[ \t]{0,3}```[ \t]*$""")

    private fun isBlockLine(line: String): Boolean =
        heading.matches(line) || bullet.matches(line) || ordered.matches(line) ||
            quote.matches(line) || fence.matches(line)

    private fun mayHoldBlock(text: String): Boolean =
        text.any { it in "#-*+>`" || it.isDigit() }

    fun hasBlockSyntax(text: String): Boolean {
        if (!mayHoldBlock(text)) return false
        return text.split("\n").any(::isBlockLine)
    }

    fun parse(text: String): List<TextBlock> {
        if (text.isEmpty()) return emptyList()
        if (!hasBlockSyntax(text)) return listOf(TextBlock.Paragraph(text))
        val lines = text.split("\n")
        val blocks = mutableListOf<TextBlock>()
        var index = 0

        fun end(from: Int, keep: (String) -> Boolean): Int {
            var cursor = from
            while (cursor < lines.size && keep(lines[cursor])) cursor++
            return cursor
        }

        while (index < lines.size) {
            val line = lines[index]
            val fenced = fence.matchEntire(line)
            val titled = heading.matchEntire(line)
            val numbered = ordered.matchEntire(line)
            when {
                fenced != null -> {
                    val close = end(index + 1) { !closingFence.matches(it) }
                    val language = fenced.groupValues[1].ifEmpty { null }
                    blocks += TextBlock.Code(language, lines.subList(index + 1, close).joinToString("\n"))
                    index = close + 1
                }
                titled != null -> {
                    blocks += TextBlock.Heading(titled.groupValues[1].length, titled.groupValues[2].trim())
                    index++
                }
                quote.matches(line) -> {
                    val stop = end(index) { quote.matches(it) }
                    val body = lines.subList(index, stop).joinToString("\n") { quote.matchEntire(it)?.groupValues?.get(1).orEmpty() }
                    blocks += TextBlock.Quote(body)
                    index = stop
                }
                bullet.matches(line) -> {
                    val stop = end(index) { bullet.matches(it) }
                    val items = lines.subList(index, stop).map { bullet.matchEntire(it)?.groupValues?.get(1).orEmpty() }
                    blocks += TextBlock.ListBlock(ordered = false, start = 1, items = items)
                    index = stop
                }
                numbered != null -> {
                    val stop = end(index) { ordered.matches(it) }
                    val items = lines.subList(index, stop).map { ordered.matchEntire(it)?.groupValues?.get(2).orEmpty() }
                    blocks += TextBlock.ListBlock(ordered = true, start = numbered.groupValues[1].toIntOrNull() ?: 1, items = items)
                    index = stop
                }
                else -> {
                    val stop = end(index) { !isBlockLine(it) }
                    val paragraph = lines.subList(index, stop)
                    val first = paragraph.indexOfFirst { it.isNotBlank() }
                    val last = paragraph.indexOfLast { it.isNotBlank() }
                    if (first >= 0) blocks += TextBlock.Paragraph(paragraph.subList(first, last + 1).joinToString("\n"))
                    index = stop
                }
            }
        }
        return blocks
    }
}
