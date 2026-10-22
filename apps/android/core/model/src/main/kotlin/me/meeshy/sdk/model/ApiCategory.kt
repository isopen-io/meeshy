package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Wire shape of a user conversation-category as the gateway
 * `GET /me/preferences/categories` route returns it (mirrors iOS
 * `ConversationCategory` in `ServiceModels.swift` and the gateway
 * `conversationCategorySchema`).
 *
 * The render-only attributes (`color`, `icon`, `isExpanded`) are decoded but do not
 * cross into the pure section-grouping logic — [toOption] narrows each row to the
 * [CategoryOption] the catalogue reducer and section splitter reason about. Every
 * field but `id`/`name` is nullable so a partial row (the gateway omits `order` on a
 * freshly created category before a reorder) still decodes.
 */
@Serializable
data class ApiCategory(
    val id: String,
    val name: String,
    val color: String? = null,
    val icon: String? = null,
    val order: Int? = null,
    val isExpanded: Boolean? = null,
)

/**
 * Narrows a wire [ApiCategory] to the framework-free [CategoryOption] the catalogue
 * grouping consumes — keeps `id`/`name`/`order`, drops the render-only fields. A
 * `null` `order` is preserved (not coerced) so the catalogue's null-last snapshot
 * ordering stays faithful.
 */
fun ApiCategory.toOption(): CategoryOption =
    CategoryOption(id = id, name = name, order = order)

/** Maps a wire category list to catalogue options, preserving order. */
fun List<ApiCategory>.toOptions(): List<CategoryOption> = map { it.toOption() }

/**
 * Body of `PATCH /me/preferences/categories/{id}` — the only field iOS
 * `PreferenceService.patchCategory(id:isExpanded:)` ever sends: whether the user folded
 * or unfolded the category's section in the conversation list.
 */
@Serializable
data class CategoryPatchBody(val isExpanded: Boolean)

/**
 * The fold state the gateway holds per category, keyed by id. A row that does not state
 * it (`isExpanded == null`, a category created before its first fold) is absent from the
 * map, so the section keeps its default (expanded) rather than inheriting a guess.
 */
fun List<ApiCategory>.expansionById(): Map<String, Boolean> =
    mapNotNull { category -> category.isExpanded?.let { category.id to it } }.toMap()
