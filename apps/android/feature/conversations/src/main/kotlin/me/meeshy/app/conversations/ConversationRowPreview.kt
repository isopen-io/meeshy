package me.meeshy.app.conversations

/**
 * The resolved preview line for a conversation row plus whether it renders in the
 * conversation accent colour and its message-summary [kind]. Priority mirrors iOS
 * `ThemedConversationRow`: a live typing indicator supersedes an unsent draft,
 * which supersedes the last message. Typing and draft both paint in the accent —
 * they signal live, personal activity — while a plain last message stays in the
 * secondary text colour. [kind] is the classifier decision (used only when neither
 * typing nor draft applies) — the Compose row picks a kind-appropriate style
 * (icon + italic for EXPIRED/HIDDEN/VIEW_ONCE, timer badge for EPHEMERAL_ACTIVE).
 * Defaulted to STANDARD so a plain typing/draft path is trivially expressible.
 */
data class RowPreview(
    val text: String,
    val isAccent: Boolean,
    val kind: MessageSummaryKind = MessageSummaryKind.STANDARD,
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

/**
 * Kind-aware overload — the conversation-list row calls this so a summary
 * [SummaryLine.kind] (EXPIRED/HIDDEN/VIEW_ONCE/EPHEMERAL_ACTIVE) surfaces to
 * the Compose layer for kind-specific styling. Typing and draft still supersede
 * the summary; their kind stays STANDARD (their accent styling is the isAccent
 * flag, not the kind).
 */
fun conversationRowPreview(
    typingLine: String?,
    draftLine: String?,
    summary: SummaryLine,
): RowPreview = when {
    typingLine != null -> RowPreview(typingLine, isAccent = true, kind = MessageSummaryKind.STANDARD)
    draftLine != null -> RowPreview(draftLine, isAccent = true, kind = MessageSummaryKind.STANDARD)
    else -> RowPreview(summary.text, isAccent = false, kind = summary.kind)
}
