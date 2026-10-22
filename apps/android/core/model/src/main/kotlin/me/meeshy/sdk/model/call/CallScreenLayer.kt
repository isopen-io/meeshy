package me.meeshy.sdk.model.call

/** A panel the call screen can open; mirrors iOS `CallScreenPanel`. */
enum class CallScreenPanel(val action: CallAction, val isDrawnInThePill: Boolean) {
    React(CallAction.React, true),
    Record(CallAction.Recording, true),
    People(CallAction.AddPeople, false),
    Journal(CallAction.Journal, false),
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
    data class Panel(val panel: CallScreenPanel) : CallScreenLayer
    data class Mode(val mode: CallScreenMode) : CallScreenLayer

    val openPanel: CallScreenPanel? get() = (this as? Panel)?.panel
    val activeMode: CallScreenMode? get() = (this as? Mode)?.mode

    val isExpanded: Boolean get() = this is Menu || this is Panel

    val pillPanel: CallScreenPanel? get() = openPanel?.takeIf { it.isDrawnInThePill }

    val showsFamilyRows: Boolean
        get() = when (this) {
            Menu -> true
            is Panel -> !panel.isDrawnInThePill
            Idle, is Mode -> false
        }

    val freesTheScreen: Boolean get() = activeMode != null

    val mayAutoHide: Boolean get() = this is Idle || this is Menu

    fun togglingMenu(): CallScreenLayer = when (this) {
        Idle -> Menu
        Menu, is Panel -> Idle
        is Mode -> this
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
        is Mode -> if (mode.action !in actions) Idle else this
        Idle, Menu -> this
    }
}
