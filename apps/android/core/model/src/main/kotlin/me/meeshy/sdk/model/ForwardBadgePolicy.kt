package me.meeshy.sdk.model

/**
 * Product rule (spec 2026-08-19, Volet C.1): the "Forwarded" badge names the
 * SOURCE conversation for any group (`group`, `public`, `global`, `community`,
 * `channel`, `broadcast`), never for a one-to-one (`direct`, `bot`). An unknown
 * type — a cache row older than the field — keeps the status quo: the name is
 * shown when present.
 *
 * Hiding = returning `null`: the forwarded indicator then falls back to its
 * existing generic "Forwarded" label, with no new localized key required.
 *
 * TWIN RULE — any change must touch all three sites:
 * - `apps/ios/Meeshy/Features/Main/Views/Bubble/ForwardBadgePolicy.swift`
 * - `apps/web/lib/forward-badge.ts`
 *
 * Stateless and pure.
 */
object ForwardBadgePolicy {
    private val HIDDEN_TYPES = setOf("direct", "bot")

    fun conversationName(ref: ForwardReference?): String? {
        val name = ref?.conversationName?.takeIf { it.isNotEmpty() } ?: return null
        if (ref.conversationType in HIDDEN_TYPES) return null
        return name
    }
}
