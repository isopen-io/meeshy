package me.meeshy.app.conversations

/**
 * The resolved preview line for a conversation row plus whether it renders in the
 * conversation accent colour. Priority mirrors iOS `ThemedConversationRow`: a live
 * typing indicator supersedes an unsent draft, which supersedes the last message.
 * Typing and draft both paint in the accent — they signal live, personal activity —
 * while a plain last message stays in the secondary text colour.
 */
data class RowPreview(
    val text: String,
    val isAccent: Boolean,
)

/**
 * The "<name> is typing…" line for a row, or `null` when nobody is typing there (so the
 * caller falls back to the draft, then the last message). A `null`/blank name is treated
 * as "nobody" rather than formatting an empty name. [format] is the localized one-argument
 * template (e.g. `"%1$s is typing…"`).
 */
fun typingPreview(typingDisplayName: String?, format: String): String? {
    val name = typingDisplayName?.trim().orEmpty()
    if (name.isEmpty()) return null
    return format.format(name)
}

/**
 * Decides the row preview from the three candidate lines in priority order:
 * typing → draft → last message. [lastMessage] is always non-null (upstream degrades it
 * to a "no messages" label), so this never yields an empty preview.
 */
fun conversationRowPreview(
    typingLine: String?,
    draftLine: String?,
    lastMessage: String,
): RowPreview = when {
    typingLine != null -> RowPreview(typingLine, isAccent = true)
    draftLine != null -> RowPreview(draftLine, isAccent = true)
    else -> RowPreview(lastMessage, isAccent = false)
}
