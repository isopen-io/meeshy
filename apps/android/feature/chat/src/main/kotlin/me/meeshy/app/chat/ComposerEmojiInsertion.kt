package me.meeshy.app.chat

/**
 * The pure core behind the composer drawer's Emoji tile (issue #3738): inserting
 * an emoji into the draft at the current cursor/selection, instead of always
 * appending to the end. A standard text-field "replace selection" edit — the
 * emoji replaces whatever is selected (a collapsed selection is a plain cursor
 * position, the common case), and the returned cursor sits immediately AFTER the
 * inserted emoji so a second tap from the same panel chains naturally rather than
 * typing back inside the one just inserted.
 *
 * [selectionStart]/[selectionEnd] are UTF-16 code-unit offsets into [text],
 * matching `androidx.compose.ui.text.TextRange` — the Compose call site converts
 * to/from that type, keeping this object itself free of any Compose/Android
 * dependency so it stays a plain JVM unit under test. Offsets are coerced into
 * `0..text.length` rather than trusted as already in range: a stale selection can
 * reach here if the panel is opened right as an external draft change (e.g. the
 * autosave restore, or a send that clears the composer) lands first.
 */
object ComposerEmojiInsertion {

    /** [text] is the full draft after insertion; [cursor] is where the caret belongs next. */
    data class Result(val text: String, val cursor: Int)

    fun insert(text: String, selectionStart: Int, selectionEnd: Int, emoji: String): Result {
        val start = selectionStart.coerceIn(0, text.length)
        val end = selectionEnd.coerceIn(0, text.length)
        val lo = minOf(start, end)
        val hi = maxOf(start, end)
        val newText = text.substring(0, lo) + emoji + text.substring(hi)
        return Result(text = newText, cursor = lo + emoji.length)
    }
}
