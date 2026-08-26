package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryItem

/**
 * The locked repost attribution shown after a story author's name in the viewer
 * header — a repost icon and, when known, the original author's `@handle`
 * (**never** the word "via": the icon already says it is a repost). It is
 * *locked* in the sense that it is derived from the story itself, not from any
 * editable field: a story that is a repost always carries it, and it cannot be
 * removed by the viewer.
 *
 * A non-null instance means the story **is** a repost (so the icon shows).
 * [handle] is the `@handle` text to show, or null when no attributable handle
 * is known (the icon still shows, without a handle) — this mirrors iOS, where
 * the repost glyph is gated on `repostOfId != nil` while the handle text is
 * gated on a resolvable `repostAuthorUsername ?? repostAuthorName`.
 *
 * Port of the header attribution in `StoryViewerView+Sidebar.swift`.
 */
data class StoryRepostAttribution(val handle: String?) {
    companion object {
        /**
         * Resolves the attribution from the raw repost fields.
         *
         * - Not a repost ([repostOfId] null or blank) → null (no icon, no handle).
         * - A repost → a [StoryRepostAttribution] whose [handle] is the first
         *   **non-blank** of [repostAuthorUsername] then [repostAuthorName],
         *   trimmed; both absent/blank → null handle (the icon still shows).
         *
         * Preferring the first non-blank value (rather than iOS's `??`, which lets
         * a present-but-empty username win and render a lone `@`) means a blank
         * username still falls back to a real name.
         */
        fun resolve(
            repostOfId: String?,
            repostAuthorUsername: String?,
            repostAuthorName: String?,
        ): StoryRepostAttribution? {
            if (repostOfId.isNullOrBlank()) return null
            val handle = listOfNotNull(repostAuthorUsername, repostAuthorName)
                .map { it.trim() }
                .firstOrNull { it.isNotEmpty() }
            return StoryRepostAttribution(handle = handle)
        }

        /** Convenience overload resolving straight from a [StoryItem]. */
        fun resolve(item: StoryItem): StoryRepostAttribution? = resolve(
            repostOfId = item.repostOfId,
            repostAuthorUsername = item.repostAuthorUsername,
            repostAuthorName = item.repostAuthorName,
        )
    }
}
