package me.meeshy.app.i18n

// Detects user-visible text written as a literal in Kotlin sources — the text a translation
// can never reach. The scan is a RATCHET (HardcodedUiTextGuardTest): the literals that exist
// today are recorded in a baseline, a new one fails, and a baseline line that no longer
// matches fails as well, so the baseline can only shrink.
//
// It looks for the five forms that put a literal on screen or in a notification:
//   Text("…") / Text(text = "…"), contentDescription = "…", NotificationChannel(id, "…", …),
//   setContentTitle("…") and Toast.makeText(ctx, "…", …).
// A literal made only of interpolations, symbols or digits ("@$name", "${n}×", "·") carries
// no wording to translate and is ignored.

internal enum class HardcodedKind(val id: String, pattern: String) {
    TEXT("Text", """\bText\(\s*(?:text\s*=\s*)?""" + QUOTED),
    CONTENT_DESCRIPTION("contentDescription", """\bcontentDescription\s*=\s*""" + QUOTED),
    NOTIFICATION_CHANNEL("NotificationChannel", """\bNotificationChannel\(\s*""" + ARGUMENT + """,\s*""" + QUOTED),
    CONTENT_TITLE("setContentTitle", """\bsetContentTitle\(\s*""" + QUOTED),
    TOAST("Toast.makeText", """\bToast\.makeText\(\s*""" + ARGUMENT + """,\s*""" + QUOTED),
    ;

    val regex: Regex = Regex(pattern)
}

private const val QUOTED: String = "\"((?:[^\"\\\\\\r\\n]|\\\\.)*)\""
private const val ARGUMENT: String = """(?:[^,()"]|\([^()]*\))+"""

internal data class HardcodedLiteral(
    val path: String,
    val line: Int,
    val kind: HardcodedKind,
    val literal: String,
) {
    val baselineLine: String get() = "${kind.id} | $path | ${literal.trim()}"

    override fun toString(): String = "$path:$line  ${kind.id}(\"$literal\")"
}

internal object HardcodedUiText {

    private val triggers = listOf("Text(", "contentDescription", "NotificationChannel(", "setContentTitle(", "Toast.makeText(")

    fun scan(path: String, source: String): List<HardcodedLiteral> {
        if (triggers.none { it in source }) return emptyList()
        val code = blankComments(source)
        return HardcodedKind.entries
            .flatMap { kind ->
                kind.regex.findAll(code).mapNotNull { match ->
                    val literal = match.groupValues[1]
                    if (!carriesWording(literal)) return@mapNotNull null
                    HardcodedLiteral(path, lineOf(code, match.range.first), kind, literal)
                }.toList()
            }
            .sortedWith(compareBy({ it.line }, { it.kind }))
    }

    fun parseBaseline(text: String): List<String> =
        text.lineSequence()
            .map { it.trim() }
            .filter { it.isNotEmpty() && !it.startsWith("#") }
            .map { line ->
                val parts = line.split("|", limit = 3).map { it.trim() }
                require(parts.size == 3 && parts[0] in HardcodedKind.entries.map { it.id }) {
                    "ligne de baseline invalide « $line » : attendu « forme | chemin | littéral »"
                }
                parts.joinToString(" | ")
            }
            .toList()

    fun carriesWording(literal: String): Boolean = withoutTemplates(literal).any { it.isLetter() }

    private fun lineOf(code: String, index: Int): Int = code.substring(0, index).count { it == '\n' } + 1

    private fun withoutTemplates(literal: String): String =
        buildString {
            var i = 0
            while (i < literal.length) {
                val c = literal[i]
                val next = literal.getOrNull(i + 1)
                i = when {
                    c == '\\' && next == 'u' -> i + 6
                    c == '\\' -> i + 2
                    c == '$' && next == '{' -> skipBraces(literal, i + 1)
                    c == '$' && next != null && (next.isLetter() || next == '_') -> skipIdentifier(literal, i + 1)
                    else -> {
                        append(c)
                        i + 1
                    }
                }
            }
        }

    private fun skipBraces(text: String, open: Int): Int {
        var depth = 0
        var i = open
        while (i < text.length) {
            when (text[i]) {
                '{' -> depth++
                '}' -> if (--depth == 0) return i + 1
            }
            i++
        }
        return text.length
    }

    private fun skipIdentifier(text: String, start: Int): Int {
        var i = start
        while (i < text.length && (text[i].isLetterOrDigit() || text[i] == '_')) i++
        return i
    }

    // Replaces every comment by blanks (newlines kept, so line numbers hold) while leaving
    // strings and character literals untouched: "https://x" is not a comment, '"' opens no string.
    fun blankComments(source: String): String {
        val out = StringBuilder(source.length)
        var i = 0
        while (i < source.length) {
            val c = source[i]
            val next = source.getOrNull(i + 1)
            i = when {
                c == '/' && next == '/' -> blankLineComment(source, i, out)
                c == '/' && next == '*' -> blankBlockComment(source, i, out)
                source.startsWith("\"\"\"", i) -> copyRawString(source, i, out)
                c == '"' -> copyString(source, i, out)
                c == '\'' -> copyCharLiteral(source, i, out)
                else -> {
                    out.append(c)
                    i + 1
                }
            }
        }
        return out.toString()
    }

    private fun blankLineComment(source: String, start: Int, out: StringBuilder): Int {
        var i = start
        while (i < source.length && source[i] != '\n') {
            out.append(' ')
            i++
        }
        return i
    }

    private fun blankBlockComment(source: String, start: Int, out: StringBuilder): Int {
        var i = start
        var depth = 0
        while (i < source.length) {
            when {
                source.startsWith("/*", i) -> {
                    depth++
                    out.append("  ")
                    i += 2
                }
                source.startsWith("*/", i) -> {
                    depth--
                    out.append("  ")
                    i += 2
                    if (depth == 0) return i
                }
                else -> {
                    out.append(if (source[i] == '\n') '\n' else ' ')
                    i++
                }
            }
        }
        return i
    }

    private fun copyRawString(source: String, start: Int, out: StringBuilder): Int {
        val close = source.indexOf("\"\"\"", start + 3)
        val end = if (close < 0) source.length else close + 3
        out.append(source, start, end)
        return end
    }

    private fun copyString(source: String, start: Int, out: StringBuilder): Int {
        var i = start + 1
        out.append('"')
        while (i < source.length && source[i] != '\n') {
            val c = source[i]
            out.append(c)
            i++
            if (c == '\\' && i < source.length && source[i] != '\n') {
                out.append(source[i])
                i++
            } else if (c == '"') {
                return i
            }
        }
        return i
    }

    private fun copyCharLiteral(source: String, start: Int, out: StringBuilder): Int {
        val close = if (source.getOrNull(start + 1) == '\\') source.indexOf('\'', start + 3) else start + 2
        val end = if (close < 0 || close >= source.length) start + 1 else close + 1
        out.append(source, start, end)
        return end
    }
}
