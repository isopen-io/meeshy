package me.meeshy.sdk.model.conversationoptions

/**
 * Pure tag-chip decisions shared by the conversation-list "Tags" dialog and the Options of the
 * conversation info (parity iOS `ConversationOptionsViewModel.addTag`/`.removeTag` and the
 * `TagInputField` autocomplete over the user's known tags).
 */
object ConversationTagsEditor {

    fun add(current: List<String>, tag: String): List<String> {
        val trimmed = tag.trim()
        if (trimmed.isEmpty() || current.contains(trimmed)) return current
        return current + trimmed
    }

    fun remove(current: List<String>, tag: String): List<String> = current - tag

    /** Known tags matching [query] (case-insensitive, trimmed) that are not already [selected], sorted. */
    fun suggestions(known: List<String>, selected: List<String>, query: String): List<String> {
        val needle = query.trim().lowercase()
        return known
            .map { it.trim() }
            .filter { it.isNotEmpty() && it !in selected && it.lowercase().contains(needle) }
            .distinct()
            .sortedBy { it.lowercase() }
    }

    /** Every distinct non-blank tag across the user's conversations — the autocomplete corpus. */
    fun corpus(tagSets: List<List<String>>): List<String> =
        tagSets.flatten().map { it.trim() }.filter { it.isNotEmpty() }.distinct().sorted()
}
