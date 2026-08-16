package me.meeshy.app.conversations

/**
 * Pure tag-chip add/remove decisions for the conversation "Tags" context-menu
 * dialog (parity iOS `ConversationOptionsViewModel.addTag`/`.removeTag`). No
 * autocomplete-against-known-tags in this first cut — deferred, see
 * `feature-parity.md`.
 */
object ConversationTagsEditor {

    fun add(current: List<String>, tag: String): List<String> {
        val trimmed = tag.trim()
        if (trimmed.isEmpty() || current.contains(trimmed)) return current
        return current + trimmed
    }

    fun remove(current: List<String>, tag: String): List<String> = current - tag
}
