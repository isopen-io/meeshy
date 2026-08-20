package me.meeshy.app.conversations

/**
 * Pure width-based tag-fitting for the conversation-row tag chips.
 *
 * Faithful port of iOS `ThemedConversationRow.visibleTagsInfo` +
 * `MeeshyConversationTag.estimatedWidth` (CoreModels.swift). The width is a
 * character-count heuristic — never a real text measurement — so the whole
 * decision is deterministic and JVM-testable; the Compose layer only supplies
 * the container width and paints the resulting chips.
 *
 * Kept in `:feature:conversations` rather than on the `:core:model` wire type
 * (where iOS parks `estimatedWidth`) because it is a row-layout heuristic, not a
 * property of the transported tag — SDK purity: models stay layout-agnostic.
 */
object ConversationTagRow {

    private const val CHAR_WIDTH = 7.0
    private const val NAME_PADDING = 22.0
    private const val TAG_SPACING = 6.0
    private const val OVERFLOW_BADGE_WIDTH = 32.0

    data class Fit(val visible: List<String>, val remaining: Int)

    fun estimatedWidth(name: String): Double = name.length * CHAR_WIDTH + NAME_PADDING

    fun fit(tags: List<String>, availableWidth: Double): Fit {
        if (tags.isEmpty()) return Fit(visible = emptyList(), remaining = 0)

        var totalWidth = 0.0
        val visible = mutableListOf<String>()

        for (tag in tags) {
            val neededWidth = totalWidth + estimatedWidth(tag) +
                if (visible.isEmpty()) 0.0 else TAG_SPACING
            val remainingTagsCount = tags.size - visible.size - 1
            val reserveSpace = if (remainingTagsCount > 0) OVERFLOW_BADGE_WIDTH + TAG_SPACING else 0.0

            if (neededWidth + reserveSpace <= availableWidth) {
                visible.add(tag)
                totalWidth = neededWidth
            } else {
                break
            }
        }

        if (visible.isEmpty()) visible.add(tags.first())

        return Fit(visible = visible.toList(), remaining = tags.size - visible.size)
    }
}
