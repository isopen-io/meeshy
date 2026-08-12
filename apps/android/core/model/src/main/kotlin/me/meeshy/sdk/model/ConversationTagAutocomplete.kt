package me.meeshy.sdk.model

/**
 * The rendered state of the conversation tag-autocomplete panel — produced by
 * [ConversationTagAutocomplete.resolve].
 *
 * @property suggestions the known tags offered for one tap, minus the ones already
 *   selected, filtered by the current query and capped at
 *   [ConversationTagAutocomplete.MAX_SUGGESTIONS].
 * @property canCreate whether a "create this tag" affordance is shown (the trimmed
 *   query is non-blank and matches neither a selected nor a known tag, case-insensitively).
 * @property submitTag the tag committing the field (Enter) would add, or `null` when
 *   submit is inert: the first suggestion when the panel has matches, else the trimmed
 *   query when it is creatable.
 */
data class TagAutocompleteState(
    val suggestions: List<String>,
    val canCreate: Boolean,
    val submitTag: String?,
)

/**
 * Pure decision core for the conversation tag-autocomplete field.
 *
 * Faithful port of the logic embedded in iOS `TagInputField`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Primitives/TagInputField.swift`): the
 * `suggestions` pool (`knownTags` minus `selectedTags`, filtered by a
 * case-insensitive substring of the trimmed query, `prefix(8)`), the `canCreate`
 * guard, the `submit()` resolution (first suggestion else the creatable query), and
 * the `addTag()` immutable append (trim + exact-dedup guard).
 *
 * SOTA note: iOS recomputes each of these as computed properties inside a SwiftUI
 * `View`, so none of it is unit-testable without a UI host. Android folds the whole
 * panel into this framework-free SSOT returning a [TagAutocompleteState], leaving the
 * Compose field a dumb renderer — every branch is covered here on the JVM.
 */
object ConversationTagAutocomplete {

    /** Maximum tags surfaced in the suggestion panel (iOS `prefix(8)`). */
    const val MAX_SUGGESTIONS: Int = 8

    /** The panel state for [query] over the [knownTags] corpus and current [selectedTags]. */
    fun resolve(
        knownTags: List<String>,
        selectedTags: List<String>,
        query: String,
    ): TagAutocompleteState {
        val trimmed = query.trim()
        val pool = knownTags.filter { it !in selectedTags }
        val suggestions = if (trimmed.isEmpty()) {
            pool.take(MAX_SUGGESTIONS)
        } else {
            pool.filter { it.contains(trimmed, ignoreCase = true) }.take(MAX_SUGGESTIONS)
        }
        val canCreate = trimmed.isNotEmpty() &&
            selectedTags.none { it.equals(trimmed, ignoreCase = true) } &&
            knownTags.none { it.equals(trimmed, ignoreCase = true) }
        val submitTag = suggestions.firstOrNull() ?: trimmed.takeIf { canCreate }
        return TagAutocompleteState(
            suggestions = suggestions,
            canCreate = canCreate,
            submitTag = submitTag,
        )
    }

    /**
     * The next selection after adding [name] (a tapped suggestion, the create row, or a
     * submit), or `null` when the add is inert: the trimmed name is blank or already
     * present in [selectedTags] (exact match, mirroring iOS `addTag`'s `contains` guard).
     */
    fun append(selectedTags: List<String>, name: String): List<String>? {
        val trimmed = name.trim()
        if (trimmed.isEmpty() || trimmed in selectedTags) return null
        return selectedTags + trimmed
    }
}
