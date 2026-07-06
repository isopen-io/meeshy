package me.meeshy.app.stories

/**
 * The two tool families of the story composer's bottom band — parity with iOS
 * `BandCategory`. **Contenu** groups the tools that add content to the slide (text,
 * media); **Effets** groups the story's appearance / audience settings (visibility
 * today, filters / drawing / timeline as those land).
 */
enum class BandCategory {
    CONTENU,
    EFFETS;

    /** The other category — what a horizontal swipe / the inactive FAB selects. */
    val swapped: BandCategory get() = if (this == CONTENU) EFFETS else CONTENU
}

/**
 * A tool tile inside the **Contenu** band. Each maps to an existing composer action
 * (add an on-canvas text element / pick media); the band renders them in declaration
 * order. Effets surfaces the visibility control directly rather than via tiles.
 */
enum class ComposerContentTile {
    TEXT,
    MEDIA,
    STICKER;

    /** Every content tile belongs to [BandCategory.CONTENU]. */
    val category: BandCategory get() = BandCategory.CONTENU
}

/**
 * The bottom-band drawer state — the pure value-type port of iOS `BandStateMachine`,
 * scoped to what the composer wires today: the drawer is either [Hidden] (only the
 * Contenu / Effets FABs show) or open on one [BandCategory]'s tools ([Tiles]). Every
 * transition is total and deterministic so the toolbar Composable stays glue and the
 * decision lives in one unit-tested place.
 */
sealed interface ComposerBandState {

    /** Drawer closed — only the FABs are visible. */
    data object Hidden : ComposerBandState

    /** Drawer open on [category]'s tools. */
    data class Tiles(val category: BandCategory) : ComposerBandState

    /** The category whose tools are showing, or null while [Hidden]. */
    val activeCategory: BandCategory?
        get() = (this as? Tiles)?.category

    /** True while the drawer is open. */
    val isVisible: Boolean get() = this is Tiles

    /**
     * Tapping the [category] FAB toggles its drawer: opens it from [Hidden], **switches**
     * to it when the other category is open, and **closes** the band when that same
     * category is already open (the FAB doubles as a close affordance).
     */
    fun tapFab(category: BandCategory): ComposerBandState =
        if (this is Tiles && this.category == category) Hidden else Tiles(category)

    /** Swiping the band down dismisses it to [Hidden] from any state. */
    fun swipeDown(): ComposerBandState = Hidden

    /**
     * A horizontal swipe swaps to the other category — only meaningful while the drawer
     * is open; inert while [Hidden].
     */
    fun swipeHorizontal(): ComposerBandState =
        if (this is Tiles) Tiles(category.swapped) else this
}

/** Pure lookups for the band's content. */
object ComposerBand {
    /** The Contenu tools, in render order. */
    val contentTiles: List<ComposerContentTile> = ComposerContentTile.entries
}
