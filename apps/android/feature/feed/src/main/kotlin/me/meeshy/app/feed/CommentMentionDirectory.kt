package me.meeshy.app.feed

import me.meeshy.sdk.model.ApiPostComment

/**
 * Builds the `username → display name` directory for a post's comment thread. This is product
 * orchestration (it belongs in `:feature:feed`, not the SDK): it encodes the Meeshy rule for
 * *which* participants can resolve a `@Display Name` mention token inside a rendered comment.
 *
 * The map is consumed by `MessageTextParser`/`RichMessageText` — the same rich-text renderer the
 * chat bubble uses — so `@Alice Wonder` in a comment resolves to a highlighted, tappable mention
 * link exactly as it does in a message. A bare `@alice` handle still resolves without any map, so
 * the directory only ever *adds* display-name resolution; it never removes the base handle rule.
 *
 * Filter parity with the web `buildMentionDisplayMap` (mention-display.ts), extended to the comment
 * thread — the Android equivalent of iOS feeding `UserDisplayNameCache` from comment/post authors:
 *  - a blank handle is dropped (a mention can never address it),
 *  - an absent or blank display name is dropped (only the bare-handle rule can render that author),
 *  - a vanity `displayName == username` is dropped (there is no distinct display name to resolve).
 * A later author for the same handle wins, mirroring the web map's overwrite semantics; a stable
 * display name makes this inert in practice.
 */
object CommentMentionDirectory {

    fun build(comments: List<ApiPostComment>): Map<String, String> {
        val directory = LinkedHashMap<String, String>()
        comments.forEach { comment ->
            val author = comment.author ?: return@forEach
            val handle = author.username?.trim().orEmpty()
            if (handle.isEmpty()) return@forEach
            val displayName = author.displayName?.trim().orEmpty()
            if (displayName.isEmpty() || displayName == handle) return@forEach
            directory[handle] = displayName
        }
        return directory
    }
}
