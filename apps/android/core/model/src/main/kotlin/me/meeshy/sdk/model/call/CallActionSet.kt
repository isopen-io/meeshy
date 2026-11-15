package me.meeshy.sdk.model.call

/** What the call allows, read once per render from the call state. Mirrors iOS `CallActionContext`. */
data class CallActionContext(
    val isDesktop: Boolean,
    val isVideoEnabled: Boolean,
    /** Several selectable cameras: the picker replaces the plain "flip". */
    val hasSelectableCameras: Boolean,
    val isConnected: Boolean,
    val mayRecord: Boolean,
    val showsVideo: Boolean = isVideoEnabled,
)

/** One row of the pill: a family and its actions, in order. */
data class CallActionFamilyRow(val family: CallActionFamily, val actions: List<CallAction>)

/**
 * The actions the "(…)" unfolds, per family ("my image" / "the call"). Pure rules —
 * which actions, in which order, when — the views only draw them. Mirrors iOS
 * `CallActionSet.resolve` (`CallControlsLayout.swift`). « The call » reads Captions · Record · Add · Journal · React ·
 * Capture (decided on #17329); Picture-in-Picture lives in the header, not here.
 */
data class CallActionSet(val myImage: List<CallAction>, val theCall: List<CallAction>) {

    val familyRows: List<CallActionFamilyRow>
        get() = listOf(
            CallActionFamilyRow(CallActionFamily.MyImage, myImage),
            CallActionFamilyRow(CallActionFamily.TheCall, theCall),
        ).filter { it.actions.isNotEmpty() }

    operator fun contains(action: CallAction): Boolean = action in myImage || action in theCall

    companion object {
        fun resolve(context: CallActionContext): CallActionSet =
            CallActionSet(myImage = myImageActions(context), theCall = theCallActions(context))

        private fun myImageActions(c: CallActionContext): List<CallAction> {
            val orientation = when {
                !c.isVideoEnabled -> emptyList()
                c.hasSelectableCameras -> listOf(CallAction.CameraPicker)
                c.isDesktop -> emptyList()
                else -> listOf(CallAction.FlipCamera)
            }
            val effects = if (c.isVideoEnabled) listOf(CallAction.Effects) else emptyList()
            val screen = if (!c.isDesktop && c.isConnected) listOf(CallAction.ScreenShare) else emptyList()
            return listOf(CallAction.Camera) + orientation + effects + screen
        }

        private fun theCallActions(c: CallActionContext): List<CallAction> {
            val recording = if (c.mayRecord) listOf(CallAction.Recording) else emptyList()
            val add = if (c.isConnected) listOf(CallAction.AddPeople) else emptyList()
            val react = if (c.isConnected) listOf(CallAction.React) else emptyList()
            val capture = if (c.isConnected && c.showsVideo) listOf(CallAction.Capture) else emptyList()
            return listOf(CallAction.Captions) + recording + add + listOf(CallAction.Journal) + react + capture
        }
    }
}
