package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * A conversation category as the picker's decision core needs to reason about it.
 * Only the fields the pure logic reads live here — `color` and other render-only
 * attributes stay out so this stays framework-free.
 *
 * `@Serializable` so the hydration cache can persist a catalogue snapshot verbatim
 * (see `CategorySnapshotStore`) — it is the currency the section splitter consumes,
 * so caching it directly avoids re-mapping the render-only DTO on every cold read.
 *
 * @property order the display rank; `null` sorts as `0` (iOS `order ?? 0`).
 */
@Serializable
data class CategoryOption(
    val id: String,
    val name: String,
    val order: Int? = null,
)

/**
 * How committing the category field (Enter) resolves — the outcome of iOS
 * `CategoryPickerField.submit()`.
 */
sealed interface CategorySubmit {
    /** Select an existing category found by a case-insensitive exact name match. */
    data class Select(val id: String) : CategorySubmit

    /** Create a new category with the trimmed name. */
    data class Create(val name: String) : CategorySubmit

    /** Nothing to do — the query is blank. */
    data object None : CategorySubmit
}

/**
 * The rendered state of the category picker — produced by
 * [ConversationCategoryPicker.resolve].
 *
 * @property displayed the categories offered in the suggestion list: every category
 *   except the currently-selected one, sorted by [CategoryOption.order] and (when the
 *   query is non-blank) filtered to a case-insensitive substring of the trimmed query.
 * @property canCreate whether the "create this category" affordance is shown — the
 *   trimmed query is non-blank and matches no known category name case-insensitively.
 * @property submit how pressing Enter on the current query resolves.
 */
data class CategoryPickerState(
    val displayed: List<CategoryOption>,
    val canCreate: Boolean,
    val submit: CategorySubmit,
)

/**
 * Pure decision core for the conversation category-picker field.
 *
 * Faithful port of the logic embedded in iOS `CategoryPickerField`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Primitives/CategoryPickerField.swift`):
 * `displayedCategories` (the pool minus the selected id, sorted by `order`, filtered
 * by a case-insensitive substring of the trimmed query), `canCreate`, and `submit()`
 * (select an exact case-insensitive name match, else create the trimmed query).
 *
 * SOTA note: iOS recomputes each of these as computed properties inside a SwiftUI
 * `View`, so none of it is unit-testable without a UI host. Android folds the whole
 * panel into this framework-free SSOT returning a [CategoryPickerState], leaving the
 * Compose field a dumb renderer — every branch is covered here on the JVM.
 *
 * Faithfulness note: iOS's `canCreate` guards both against the selected category and
 * against any known category. Because the selected category is always a member of
 * [categories], guarding against the whole catalogue subsumes the selected-only
 * guard — the two are equivalent, so this keeps the single `categories.none` check.
 * Equal [CategoryOption.order] values preserve input order (stable sort).
 */
object ConversationCategoryPicker {

    /** The picker state for [query] over the [categories] catalogue and current [selectedId]. */
    fun resolve(
        categories: List<CategoryOption>,
        selectedId: String?,
        query: String,
    ): CategoryPickerState {
        val trimmed = query.trim()
        val pool = categories.filter { it.id != selectedId }
        val displayed = if (trimmed.isEmpty()) {
            pool.sortedBy { it.order ?: 0 }
        } else {
            pool.filter { it.name.contains(trimmed, ignoreCase = true) }.sortedBy { it.order ?: 0 }
        }
        val canCreate = trimmed.isNotEmpty() &&
            categories.none { it.name.equals(trimmed, ignoreCase = true) }
        val submit = resolveSubmit(categories, trimmed)
        return CategoryPickerState(
            displayed = displayed,
            canCreate = canCreate,
            submit = submit,
        )
    }

    private fun resolveSubmit(categories: List<CategoryOption>, trimmed: String): CategorySubmit {
        if (trimmed.isEmpty()) return CategorySubmit.None
        val exact = categories.firstOrNull { it.name.equals(trimmed, ignoreCase = true) }
        return if (exact != null) CategorySubmit.Select(exact.id) else CategorySubmit.Create(trimmed)
    }
}
