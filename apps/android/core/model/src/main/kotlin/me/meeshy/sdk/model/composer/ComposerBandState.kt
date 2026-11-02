package me.meeshy.sdk.model.composer

/** What a format panel edits — port of iOS `BandElementKind`. */
enum class BandElementKind { TEXT, MEDIA }

/** The panel shown by the bottom band. */
sealed interface BandPanel {
    /** No panel: the tool row shows (or is voluntarily hidden, see [ComposerBandState.isChromeHidden]). */
    data object Hidden : BandPanel

    /** The options panel of one [tool]. */
    data class Tool(val tool: StoryToolMode) : BandPanel

    /** The format sub-panel of one on-canvas element; it takes precedence over tool taps. */
    data class Format(val kind: BandElementKind, val elementId: String) : BandPanel
}

/**
 * The bottom-band state machine — port of iOS `BandStateMachine`, as an immutable value.
 *
 * [isChromeHidden] is the VOLUNTARY hiding of the chrome (swipe down on the row): the only
 * state where the screen is bare by the user's decision, always reversible with one tap.
 * It lives here so the invariant
 *
 *     INV-1 : isChromeHidden == true  ⟹  panel == Hidden
 *
 * is closed by construction: hiding is refused while a panel is open, and every OPENING
 * transition clears it.
 */
data class ComposerBandState(
    val panel: BandPanel = BandPanel.Hidden,
    val isChromeHidden: Boolean = false,
) {
    /** The tool whose panel is open, or null (hidden / format panel). */
    val activeTool: StoryToolMode? get() = (panel as? BandPanel.Tool)?.tool

    val isPanelOpen: Boolean get() = panel !is BandPanel.Hidden

    /** Any tool panel can be resized / collapsed by its handle; format panel and hidden cannot. */
    val allowsCollapsibleDrawer: Boolean get() = panel is BandPanel.Tool

    /** Tap on a tool: opens it, switches to it, or closes it when it is already open. */
    fun tapTool(tool: StoryToolMode): ComposerBandState = when (val p = panel) {
        is BandPanel.Format -> this
        is BandPanel.Tool -> if (p.tool == tool) closeAnyPanel() else open(BandPanel.Tool(tool))
        BandPanel.Hidden -> open(BandPanel.Tool(tool))
    }

    /** Swipe up on a tool: forces it open (idempotent on the same tool). */
    fun swipeUpOnTool(tool: StoryToolMode): ComposerBandState =
        if (panel is BandPanel.Format) this else open(BandPanel.Tool(tool))

    fun openFormatPanel(kind: BandElementKind, elementId: String): ComposerBandState =
        open(BandPanel.Format(kind, elementId))

    fun closeFormatPanel(): ComposerBandState = if (panel is BandPanel.Format) closeAnyPanel() else this

    fun backFromToolPanel(): ComposerBandState = if (panel is BandPanel.Tool) closeAnyPanel() else this

    /**
     * The single "close what is open" transition: the chrome is given back
     * UNCONDITIONALLY, including from [BandPanel.Hidden].
     */
    fun closeAnyPanel(): ComposerBandState = Hidden

    /** Voluntary hiding — REFUSED while a panel is open (INV-1). */
    fun hideChrome(): ComposerBandState = if (panel is BandPanel.Hidden) copy(isChromeHidden = true) else this

    fun showChrome(): ComposerBandState = if (isChromeHidden) copy(isChromeHidden = false) else this

    fun toggleChrome(): ComposerBandState = if (isChromeHidden) showChrome() else hideChrome()

    private fun open(next: BandPanel) = ComposerBandState(panel = next, isChromeHidden = false)

    companion object {
        val Hidden = ComposerBandState()
    }
}
