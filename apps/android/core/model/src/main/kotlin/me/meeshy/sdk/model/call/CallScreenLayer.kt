package me.meeshy.sdk.model.call

/**
 * A panel the call screen can open; mirrors iOS `CallScreenPanel`. #17343 — Record, React AND the Journal are drawn in
 * the pill; Add people, which presents the friends list, stays a sheet under the rows.
 */
enum class CallScreenPanel(val action: CallAction, val isDrawnInThePill: Boolean) {
    React(CallAction.React, true),
    Record(CallAction.Recording, true),
    People(CallAction.AddPeople, false),
    Journal(CallAction.Journal, true),
}

/** A mode that frees the screen; mirrors iOS `CallScreenMode`. */
enum class CallScreenMode(val action: CallAction) {
    Effects(CallAction.Effects),
    Montage(CallAction.Capture),
}

/**
 * One thing open at a time on the call screen. A reducer: every transition is a
 * pure function of the current layer. Mirrors iOS `CallScreenLayer`.
 */
sealed interface CallScreenLayer {
    data object Idle : CallScreenLayer
    data object Menu : CallScreenLayer

    /** #17343 — the (…) opened OVER a journal: the journal is stowed, not closed; closing the actions gives it back. */
    data object MenuOverJournal : CallScreenLayer
    data class Panel(val panel: CallScreenPanel) : CallScreenLayer
    data class Mode(val mode: CallScreenMode) : CallScreenLayer

    val openPanel: CallScreenPanel? get() = (this as? Panel)?.panel
    val activeMode: CallScreenMode? get() = (this as? Mode)?.mode

    val isExpanded: Boolean get() = this is Menu || this is MenuOverJournal || this is Panel

    val pillPanel: CallScreenPanel? get() = openPanel?.takeIf { it.isDrawnInThePill }

    /** G3.2 — the base row is captioned at the (…) or under a sheet only; an option drawn in the pill leaves it bare, as plate G3 shows it. Mirrors iOS `captionsBaseRow`. */
    val captionsBaseRow: Boolean get() = pillPanel == null

    val showsFamilyRows: Boolean
        get() = when (this) {
            Menu, MenuOverJournal -> true
            is Panel -> !panel.isDrawnInThePill
            Idle, is Mode -> false
        }

    val freesTheScreen: Boolean get() = activeMode != null

    val mayAutoHide: Boolean get() = this is Idle || this is Menu || this is MenuOverJournal

    fun togglingMenu(): CallScreenLayer = when {
        this is Idle -> Menu
        this is Menu -> Idle
        this is Panel && panel == CallScreenPanel.Journal -> MenuOverJournal
        this is MenuOverJournal -> Panel(CallScreenPanel.Journal)
        this is Panel -> Idle
        else -> this
    }

    fun opening(panel: CallScreenPanel): CallScreenLayer = when {
        this is Mode -> this
        this is Panel && this.panel == panel -> Menu
        else -> Panel(panel)
    }

    fun backToMenu(): CallScreenLayer = if (openPanel != null) Menu else this

    fun closed(): CallScreenLayer = Idle

    fun entering(mode: CallScreenMode): CallScreenLayer = Mode(mode)

    fun exitingMode(): CallScreenLayer = if (activeMode == null) this else Idle

    fun reconciled(actions: CallActionSet): CallScreenLayer = when (this) {
        is Panel -> if (panel.action !in actions) Menu else this
        MenuOverJournal -> if (CallScreenPanel.Journal.action !in actions) Menu else this
        is Mode -> if (mode.action !in actions) Idle else this
        Idle, Menu -> this
    }
}
