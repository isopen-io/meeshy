package me.meeshy.sdk.model

/**
 * A change to the user's conversation-category corpus, arriving from a socket
 * event or a local optimistic write — the pure port of iOS
 * `CategoryRemoteEvent` (`packages/MeeshySDK/Sources/MeeshySDK/Store/UserCategoryStore.swift`).
 *
 * SOTA note: iOS keeps `.created` and `.updated` as two variants that both do
 * the same `categoriesById[cat.id] = cat` upsert in `applyRemote`. Android
 * collapses them into a single [Upserted] variant — the outcome is identical
 * (last-writer-wins by id) and the reducer stops carrying a distinction it never
 * acts on.
 */
sealed interface CategoryEvent {
    /** A category was created or updated: upsert it by id (iOS `.created` / `.updated`). */
    data class Upserted(val category: CategoryOption) : CategoryEvent

    /** A category was deleted: drop it by id (iOS `.deleted`). */
    data class Deleted(val id: String) : CategoryEvent

    /**
     * A batch reorder: patch the [orders] (id → new [CategoryOption.order]) onto the
     * matching rows, ignoring ids the catalog does not hold (iOS `.reordered`).
     */
    data class Reordered(val orders: Map<String, Int>) : CategoryEvent
}

/**
 * Ordering-and-mutation source of truth for the user's conversation-category
 * corpus — the framework-free lift of iOS `UserCategoryStore`'s actor mutation
 * methods (`create`/`update`/`delete`/`reorder`/`applyRemote`) and its
 * `sortedSnapshot()` ordering (`packages/MeeshySDK/Sources/MeeshySDK/Store/UserCategoryStore.swift`).
 *
 * Immutable: every mutator returns a new catalog, leaving the receiver untouched.
 * Rows are keyed by [CategoryOption.id] (last write wins), exactly as iOS keeps a
 * `[String: ConversationCategory]` map.
 *
 * The [sorted] snapshot is the precise input `ConversationSections.of` consumes as
 * its `categories` argument, so hydrating a catalog and reading [sorted] is the
 * whole path from "the category corpus changed" to "the conversation list
 * re-buckets". This is the building block the tracked corpus-hydration slice
 * (cache-first + revalidate) and the category socket handler both drive.
 *
 * SOTA note: iOS spreads these mutations across an actor whose every method
 * couples a state mutation to a Combine `publish()` side effect, so none of the
 * ordering or reducer logic is testable without the actor. Android folds it into
 * one stateless value type — each branch is JVM-covered and the store/ViewModel
 * that owns the live copy stays a thin shell over pure transitions.
 */
@ConsistentCopyVisibility
data class UserCategoryCatalog private constructor(
    private val byId: Map<String, CategoryOption>,
) {
    /**
     * The catalogue in display order — the port of iOS `sortedSnapshot()`:
     * ascending [CategoryOption.order] with a `null` order sorting **last**
     * (`order ?? Int.max`), then a case-insensitive name tie-break.
     *
     * Faithfulness note: this null-last ordering is deliberately distinct from the
     * category *picker*'s `order ?: 0` (which sorts null rows first) — the store's
     * snapshot and the picker's suggestion list are different surfaces with
     * different iOS orderings, and each Android port matches its own source.
     */
    val sorted: List<CategoryOption> get() = byId.values.sortedWith(ORDERING)

    /** True when the catalogue holds no categories. */
    val isEmpty: Boolean get() = byId.isEmpty()

    /** Upsert [option] by its id (iOS `.created` / `.updated`, and `create`/`update`). */
    fun upsert(option: CategoryOption): UserCategoryCatalog =
        UserCategoryCatalog(byId + (option.id to option))

    /** Drop the row with [id]; a no-op returning the same catalog when absent (iOS `applyRemote(.deleted)`). */
    fun remove(id: String): UserCategoryCatalog =
        if (byId.containsKey(id)) UserCategoryCatalog(byId - id) else this

    /**
     * Patch the [orders] (id → new order) onto matching rows, ignoring unknown ids
     * (iOS `reorder` / `applyRemote(.reordered)`, whose `guard let cat … else continue`
     * skips ids the store does not hold). An empty map is a no-op.
     */
    fun reorder(orders: Map<String, Int>): UserCategoryCatalog {
        if (orders.isEmpty()) return this
        return UserCategoryCatalog(
            byId.mapValues { (id, category) ->
                orders[id]?.let { category.copy(order = it) } ?: category
            },
        )
    }

    /** Dispatch a [CategoryEvent] to its mutator — the port of iOS `applyRemote`. */
    fun apply(event: CategoryEvent): UserCategoryCatalog = when (event) {
        is CategoryEvent.Upserted -> upsert(event.category)
        is CategoryEvent.Deleted -> remove(event.id)
        is CategoryEvent.Reordered -> reorder(event.orders)
    }

    companion object {
        /** The empty catalogue (iOS `categoriesById = [:]`). */
        val EMPTY: UserCategoryCatalog = UserCategoryCatalog(emptyMap())

        /**
         * Build a catalogue from a snapshot (iOS `hydrate` /
         * `hydrateFromSnapshot`). Duplicate ids collapse last-writer-wins — the
         * safe port of iOS `Dictionary(uniqueKeysWithValues:)`, which would trap on
         * a duplicate key.
         */
        fun of(options: List<CategoryOption>): UserCategoryCatalog =
            UserCategoryCatalog(options.associateBy { it.id })

        private val ORDERING: Comparator<CategoryOption> =
            compareBy<CategoryOption> { it.order ?: Int.MAX_VALUE }
                .thenBy(String.CASE_INSENSITIVE_ORDER) { it.name }
    }
}
