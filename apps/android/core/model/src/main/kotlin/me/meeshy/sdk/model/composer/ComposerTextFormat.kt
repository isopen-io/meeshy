package me.meeshy.sdk.model.composer

import java.text.BreakIterator

/**
 * Poser ou retirer une emphase sur une sélection : miroir de `toggleEmphasis`
 * (`packages/shared/utils/text-format.ts`) et d'iOS `ComposerTextFormat`, mêmes marqueurs (`** * __ ~~`).
 * Les positions de [toggle] sont des index de GRAPHÈMES ; [graphemeIndex] / [utf16Offset] font le pont
 * avec les offsets UTF-16 d'un champ Compose.
 */
public object ComposerTextFormat {

    public enum class Style(public val marker: String) {
        BOLD("**"), ITALIC("*"), UNDERLINE("__"), STRIKETHROUGH("~~")
    }

    public data class Result(val text: String, val start: Int, val end: Int)

    public fun graphemes(text: String): List<String> {
        val it = BreakIterator.getCharacterInstance()
        it.setText(text)
        val out = ArrayList<String>()
        var from = it.first()
        var to = it.next()
        while (to != BreakIterator.DONE) {
            out.add(text.substring(from, to))
            from = to
            to = it.next()
        }
        return out
    }

    public fun graphemeCount(text: String): Int = graphemes(text).size

    /** L'index de graphème d'un offset UTF-16 (un offset au milieu d'un graphème compte ce graphème entier). */
    public fun graphemeIndex(text: String, utf16: Int): Int {
        val limit = utf16.coerceIn(0, text.length)
        var consumed = 0
        var index = 0
        for (g in graphemes(text)) {
            if (consumed >= limit) break
            consumed += g.length
            index += 1
        }
        return index
    }

    /** L'offset UTF-16 d'un index de graphème, borné à la fin du texte. */
    public fun utf16Offset(text: String, graphemeIndex: Int): Int =
        graphemes(text).take(graphemeIndex.coerceAtLeast(0)).sumOf { it.length }

    public fun toggle(text: String, start: Int, end: Int, style: Style): Result {
        val raw = rawToggle(text, start, end, style)
        val count = graphemeCount(raw.text)
        val lower = raw.start.coerceIn(0, count)
        return Result(raw.text, lower, raw.end.coerceIn(lower, count))
    }

    private fun isBlank(g: String): Boolean = g.isNotEmpty() && g.all { it.isWhitespace() }

    private fun rawToggle(text: String, start: Int, end: Int, style: Style): Result {
        val chars = graphemes(text)
        val marker = graphemes(style.marker)
        val m = marker.size
        val lo = minOf(start, end).coerceIn(0, chars.size)
        val hi = maxOf(start, end).coerceIn(0, chars.size)

        if (lo == hi) {
            val next = chars.take(lo).joinToString("") + style.marker + style.marker + chars.drop(lo).joinToString("")
            return Result(next, lo + m, lo + m)
        }

        var s = lo
        var e = hi
        while (s < e && isBlank(chars[s])) s += 1
        while (e > s && isBlank(chars[e - 1])) e -= 1
        if (s >= e) return Result(text, lo, hi)

        if (hasOuterMarker(chars, s, e, marker)) {
            val next = chars.subList(0, s - m).joinToString("") + chars.subList(s, e).joinToString("") +
                chars.subList(e + m, chars.size).joinToString("")
            return Result(next, s - m, e - m)
        }

        val selected = chars.subList(s, e)
        if (hasInnerMarker(selected, marker)) {
            val inner = selected.subList(m, selected.size - m).joinToString("")
            val next = chars.subList(0, s).joinToString("") + inner + chars.subList(e, chars.size).joinToString("")
            return Result(next, s, e - 2 * m)
        }

        val next = chars.subList(0, s).joinToString("") + style.marker + selected.joinToString("") + style.marker +
            chars.subList(e, chars.size).joinToString("")
        return Result(next, s + m, e + m)
    }

    private fun run(chars: List<String>, from: Int, step: Int): Int {
        var count = 0
        var index = from
        while (index >= 0 && index < chars.size && chars[index] == "*") {
            count += 1
            index += step
        }
        return count
    }

    /** L'italique ne se confond pas avec le gras : une étoile SEULE (ou trois) encadre. */
    private fun hasOuterMarker(chars: List<String>, s: Int, e: Int, marker: List<String>): Boolean {
        val m = marker.size
        if (s < m || e + m > chars.size) return false
        if (chars.subList(s - m, s) != marker || chars.subList(e, e + m) != marker) return false
        if (marker != listOf("*")) return true
        return run(chars, s - 1, -1) % 2 == 1 && run(chars, e, 1) % 2 == 1
    }

    private fun hasInnerMarker(selected: List<String>, marker: List<String>): Boolean {
        val m = marker.size
        if (selected.size <= 2 * m) return false
        if (selected.subList(0, m) != marker || selected.subList(selected.size - m, selected.size) != marker) return false
        if (marker != listOf("*")) return true
        return run(selected, 0, 1) % 2 == 1 && run(selected, selected.size - 1, -1) % 2 == 1
    }
}
