package me.meeshy.app.chat

/**
 * A large paste folded into a composer attachment — the app-local model behind the
 * clipboard-content preview chip. The clock is a parameter so the value type
 * stays pure and testable, and equality is fully structural.
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
