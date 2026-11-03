package me.meeshy.sdk.model.licenses

/** One displayable license notice: the components it covers and the full text of their license. */
public data class LicenseNotice(
    val title: String,
    val text: String,
)

/**
 * libsignal as the licenses screen lists it (#14628). The app is distributed under the AGPL-3.0
 * only WHEN libsignal is linked — [PROBE_CLASS] is the class the screen looks for at runtime, so
 * the AGPL statement and the libsignal notices appear exactly when the binary carries libsignal,
 * never by a hand-kept flag. The bundled notices are Signal's `acknowledgments-android.md` at the
 * pinned tag.
 */
public object LibsignalNotices {
    public const val VERSION: String = "0.105.4"
    public const val PROBE_CLASS: String = "org.signal.libsignal.protocol.IdentityKey"
    public const val UPSTREAM_ACKNOWLEDGMENTS_URL: String =
        "https://github.com/signalapp/libsignal/blob/v$VERSION/acknowledgments/acknowledgments-android.md"

    /**
     * Reads Signal's acknowledgments Markdown: each `## title` heading followed by a fenced block
     * holding the license text. Headings without a fenced text are not notices.
     */
    public fun parse(markdown: String): List<LicenseNotice> {
        val lines = markdown.lines()
        return lines.indices
            .filter { lines[it].startsWith(HEADING) }
            .mapNotNull { index -> noticeAt(lines, index) }
    }

    private fun noticeAt(lines: List<String>, headingIndex: Int): LicenseNotice? {
        val title = lines[headingIndex].removePrefix(HEADING).trim()
        val nextHeading = (headingIndex + 1 until lines.size).firstOrNull { lines[it].startsWith(HEADING) } ?: lines.size
        val section = lines.subList(headingIndex + 1, nextHeading)
        val open = section.indexOfFirst { it.trimEnd() == FENCE }
        if (open < 0) return null
        val close = (open + 1 until section.size).firstOrNull { section[it].trimEnd() == FENCE } ?: return null
        val text = section.subList(open + 1, close).joinToString("\n").trimEnd()
        return if (title.isEmpty() || text.isEmpty()) null else LicenseNotice(title, text)
    }

    private const val HEADING = "## "
    private const val FENCE = "```"
}
