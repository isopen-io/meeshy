package me.meeshy.app.stories

/**
 * The unified set of actions a single on-canvas text element exposes through its
 * long-press context menu. Consolidates what earlier slices shipped as separate
 * floating-toolbar buttons (edit/select, duplicate, the four z-order restacks, and
 * per-element remove) into one coherent menu — iOS's per-element edit/duplicate/
 * layer/delete affordances gathered behind a single gesture.
 */
enum class StoryElementAction {
    EDIT, DUPLICATE, SEND_TO_BACK, MOVE_BACKWARD, MOVE_FORWARD, BRING_TO_FRONT, DELETE,
}

/**
 * The [StoryZOrder] restack a reorder action maps onto, or `null` for the non-reorder
 * actions (edit / duplicate / delete). One projection so the wiring never re-derives
 * the mapping and a future op cannot drift between the menu and the reducer.
 */
val StoryElementAction.zOrder: StoryZOrder?
    get() = when (this) {
        StoryElementAction.SEND_TO_BACK -> StoryZOrder.TO_BACK
        StoryElementAction.MOVE_BACKWARD -> StoryZOrder.BACKWARD
        StoryElementAction.MOVE_FORWARD -> StoryZOrder.FORWARD
        StoryElementAction.BRING_TO_FRONT -> StoryZOrder.TO_FRONT
        StoryElementAction.EDIT,
        StoryElementAction.DUPLICATE,
        StoryElementAction.DELETE,
        -> null
    }

/** One row of the element context menu: an [action] and whether it may fire now. */
data class StoryElementMenuItem(val action: StoryElementAction, val enabled: Boolean)

/**
 * The resolved unified long-press context menu for one text element. A disabled row
 * is still shown (greyed) so the menu's shape stays stable regardless of the element's
 * stacking position, but it can never dispatch an inert op.
 */
data class StoryElementContextMenu(
    val elementId: String,
    val items: List<StoryElementMenuItem>,
) {
    /** Whether [action] may fire — `false` when the row is disabled or absent. */
    fun isEnabled(action: StoryElementAction): Boolean =
        items.firstOrNull { it.action == action }?.enabled ?: false
}

/**
 * Resolves the unified context menu for an on-canvas text element. Pure — it reads the
 * deck's structure and returns which actions are available, delegating the "would this
 * op actually change anything?" question to the same rules the deck reducers enforce.
 */
object StoryElementMenu {

    /**
     * The menu for the text element [elementId] on the deck's **selected** slide (the
     * composer only ever menus the element it is editing). Returns `null` when no such
     * element lives on the selected slide, so the caller shows no menu.
     *
     * Each item's `enabled` mirrors the matching deck reducer exactly: a reorder row is
     * enabled iff [StorySlideDeck.reorderTextElement] would actually restack (i.e. the
     * element is not already at that extreme), and DUPLICATE iff
     * [StorySlideDeck.duplicateTextElement] would actually clone (the slide is below the
     * [StorySlideDeck.MAX_TEXT_ELEMENTS_PER_SLIDE] cap). EDIT and DELETE are always
     * available on a present element.
     */
    fun resolve(deck: StorySlideDeck, elementId: String): StoryElementContextMenu? {
        val elements = deck.selectedSlide.elements
        val index = elements.indexOfFirst { it.id == elementId }
        if (index < 0) return null
        val atBack = index == 0
        val atFront = index == elements.lastIndex
        val canDuplicate = elements.size < StorySlideDeck.MAX_TEXT_ELEMENTS_PER_SLIDE
        return StoryElementContextMenu(
            elementId = elementId,
            items = listOf(
                StoryElementMenuItem(StoryElementAction.EDIT, enabled = true),
                StoryElementMenuItem(StoryElementAction.DUPLICATE, enabled = canDuplicate),
                StoryElementMenuItem(StoryElementAction.SEND_TO_BACK, enabled = !atBack),
                StoryElementMenuItem(StoryElementAction.MOVE_BACKWARD, enabled = !atBack),
                StoryElementMenuItem(StoryElementAction.MOVE_FORWARD, enabled = !atFront),
                StoryElementMenuItem(StoryElementAction.BRING_TO_FRONT, enabled = !atFront),
                StoryElementMenuItem(StoryElementAction.DELETE, enabled = true),
            ),
        )
    }
}
