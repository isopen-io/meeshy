package me.meeshy.app.chat

/**
 * A large paste folded into a composer attachment — the app-local model behind the
 * clipboard-content preview chip (port of the iOS app-local `ClipboardContent`
 * struct, which the audit flags as living in `MediaPlayerContext.swift` under a
 * misleading filename). The iOS factory reads `Date()` twice; the Android port
 * takes the clock as a parameter so the value type stays pure and testable, and
 * uses full structural equality instead of iOS's id-only `==`.
 */
data class ClipboardContent(
    val id: String,
    val text: String,
    val charCount: Int,
    val truncatedPreview: String,
    val createdAtMillis: Long,
) {
    companion object {
        /** Characters of [text] kept in the preview before an ellipsis is appended. */
        const val PREVIEW_LIMIT = 200

        fun of(text: String, nowMillis: Long): ClipboardContent {
            val preview =
                if (text.length > PREVIEW_LIMIT) text.take(PREVIEW_LIMIT) + "..." else text
            return ClipboardContent(
                id = "clipboard-$nowMillis",
                text = text,
                charCount = text.length,
                truncatedPreview = preview,
                createdAtMillis = nowMillis,
            )
        }
    }
}
