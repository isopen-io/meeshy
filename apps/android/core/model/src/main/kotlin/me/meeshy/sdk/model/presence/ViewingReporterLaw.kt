package me.meeshy.sdk.model.presence

/**
 * « Est dans la conversation » (#8892), côté ÉMISSION : la loi qui décide QUAND dire au serveur
 * quelle conversation l'utilisateur a à l'écran, au premier plan. Miroir de
 * `ConversationViewingReporter` (iOS) ; jumeau de `ACTIVITY_THROTTLE_MS` côté web.
 *
 * Pure : un état immuable, une entrée, une [ViewingStep] (nouvel état + commandes à émettre).
 * L'émission, l'horloge et la minuterie du battement vivent dans `:sdk-core`.
 */
public const val VIEWING_ACTIVITY_THROTTLE_MS: Long = 2_000L

public data class ViewingReporterState(
    val viewingConversationId: String? = null,
    val isForeground: Boolean = true,
    val openings: Map<String, Int> = emptyMap(),
    val visibleScreens: Map<String, Int> = emptyMap(),
    val covers: Int = 0,
    val isCallScreenShown: Boolean = false,
    val isScrolling: Boolean = false,
    val lastActivityConversationId: String? = null,
    val lastActivityAtMillis: Long = 0L,
) {
    /** La conversation que le serveur doit croire à l'écran, ou `null`. */
    val announced: String?
        get() {
            val current = viewingConversationId ?: return null
            if (!isForeground || isCallScreenShown) return null
            return current.takeIf { (visibleScreens[it] ?: 1) > 0 }
        }

    /** Un plein écran recouvre la conversation. */
    val isCovered: Boolean get() = covers > 0
}

public sealed interface ViewingInput {
    public data class Opened(val conversationId: String) : ViewingInput
    public data class Closed(val conversationId: String) : ViewingInput
    public data class Foreground(val isForeground: Boolean) : ViewingInput
    public data class ScreenAppeared(val conversationId: String) : ViewingInput
    public data class ScreenDisappeared(val conversationId: String) : ViewingInput
    public data object CoverBegan : ViewingInput
    public data object CoverEnded : ViewingInput
    public data class CallScreen(val isShown: Boolean) : ViewingInput
    public data class Activity(val conversationId: String) : ViewingInput
    public data class Scrolling(val isScrolling: Boolean) : ViewingInput
    public data object Touched : ViewingInput
    public data class Heartbeat(val isBusy: Boolean) : ViewingInput

    /** Une (re)connexion socket : le serveur a tout oublié. */
    public data object Reconnected : ViewingInput
}

public sealed interface ViewingCommand {
    public data class Start(val conversationId: String) : ViewingCommand
    public data class Stop(val conversationId: String) : ViewingCommand
    public data class Activity(val conversationId: String, val focus: Boolean) : ViewingCommand
}

/** [wasLastScreen] : sur [ViewingInput.Closed], c'était le DERNIER écran de cette conversation. */
public data class ViewingStep(
    val state: ViewingReporterState,
    val commands: List<ViewingCommand> = emptyList(),
    val wasLastScreen: Boolean = false,
)

public object ViewingReporterLaw {

    public fun reduce(state: ViewingReporterState, input: ViewingInput, nowMillis: Long): ViewingStep =
        when (input) {
            is ViewingInput.Opened -> opened(state, input.conversationId)
            is ViewingInput.Closed -> closed(state, input.conversationId)
            is ViewingInput.Foreground ->
                if (state.isForeground == input.isForeground) ViewingStep(state)
                else transition(state, state.copy(isForeground = input.isForeground))
            is ViewingInput.ScreenAppeared -> screenAppeared(state, input.conversationId)
            is ViewingInput.ScreenDisappeared -> transition(
                state,
                state.copy(visibleScreens = state.visibleScreens + (input.conversationId to maxOf((state.visibleScreens[input.conversationId] ?: 1) - 1, 0))),
            )
            ViewingInput.CoverBegan -> coverBegan(state, nowMillis)
            ViewingInput.CoverEnded -> coverEnded(state, nowMillis)
            is ViewingInput.CallScreen ->
                if (state.isCallScreenShown == input.isShown) ViewingStep(state)
                else transition(state, state.copy(isCallScreenShown = input.isShown))
            is ViewingInput.Activity -> activity(state, input.conversationId, nowMillis)
            is ViewingInput.Scrolling -> scrolling(state, input.isScrolling, nowMillis)
            ViewingInput.Touched -> state.announced?.let { activity(state, it, nowMillis) } ?: ViewingStep(state)
            is ViewingInput.Heartbeat -> heartbeat(state, input.isBusy, nowMillis)
            ViewingInput.Reconnected -> ViewingStep(
                state,
                listOfNotNull(state.announced?.let { ViewingCommand.Start(it) }),
            )
        }

    private fun opened(state: ViewingReporterState, id: String): ViewingStep {
        if (id.isEmpty()) return ViewingStep(state)
        val next = state.copy(
            openings = state.openings + (id to (state.openings[id] ?: 0) + 1),
            viewingConversationId = id,
        )
        return transition(state, next, reannounce = true)
    }

    private fun closed(state: ViewingReporterState, id: String): ViewingStep {
        val remaining = (state.openings[id] ?: 0) - 1
        val openings = if (remaining > 0) state.openings + (id to remaining) else state.openings - id
        if (remaining > 0) return ViewingStep(state.copy(openings = openings))
        val next = state.copy(
            openings = openings,
            visibleScreens = state.visibleScreens - id,
            covers = if (openings.isEmpty()) 0 else state.covers,
            viewingConversationId = state.viewingConversationId.takeIf { it != id },
        )
        return transition(state, next).copy(wasLastScreen = true)
    }

    private fun screenAppeared(state: ViewingReporterState, id: String): ViewingStep {
        if (id.isEmpty()) return ViewingStep(state)
        val next = state.copy(
            visibleScreens = state.visibleScreens + (id to (state.visibleScreens[id] ?: 0) + 1),
            viewingConversationId = if (state.openings.containsKey(id)) id else state.viewingConversationId,
        )
        return transition(state, next)
    }

    private fun coverBegan(state: ViewingReporterState, nowMillis: Long): ViewingStep {
        val next = state.copy(covers = state.covers + 1)
        return if (next.covers == 1) signalAtOnce(next, nowMillis) else ViewingStep(next)
    }

    private fun coverEnded(state: ViewingReporterState, nowMillis: Long): ViewingStep {
        if (state.covers == 0) return ViewingStep(state)
        val next = state.copy(covers = state.covers - 1)
        return if (next.covers == 0) signalAtOnce(next, nowMillis) else ViewingStep(next)
    }

    private fun signalAtOnce(state: ViewingReporterState, nowMillis: Long): ViewingStep {
        val current = state.announced ?: return ViewingStep(state)
        return activity(state.copy(lastActivityConversationId = null), current, nowMillis)
    }

    private fun activity(state: ViewingReporterState, id: String, nowMillis: Long): ViewingStep {
        if (state.announced != id) return ViewingStep(state)
        val throttled = state.lastActivityConversationId == id &&
            nowMillis - state.lastActivityAtMillis < VIEWING_ACTIVITY_THROTTLE_MS
        if (throttled) return ViewingStep(state)
        return ViewingStep(
            state.copy(lastActivityConversationId = id, lastActivityAtMillis = nowMillis),
            listOf(ViewingCommand.Activity(id, focus = state.isCovered)),
        )
    }

    private fun scrolling(state: ViewingReporterState, isScrolling: Boolean, nowMillis: Long): ViewingStep {
        val next = state.copy(isScrolling = isScrolling)
        val current = next.announced
        return if (isScrolling && current != null) activity(next, current, nowMillis) else ViewingStep(next)
    }

    private fun heartbeat(state: ViewingReporterState, isBusy: Boolean, nowMillis: Long): ViewingStep {
        val current = state.announced ?: return ViewingStep(state)
        return if (state.isCovered || state.isScrolling || isBusy) activity(state, current, nowMillis) else ViewingStep(state)
    }

    private fun transition(
        before: ViewingReporterState,
        after: ViewingReporterState,
        reannounce: Boolean = false,
    ): ViewingStep {
        val was = before.announced
        val now = after.announced
        val commands = buildList {
            if (was != null && was != now) add(ViewingCommand.Stop(was))
            if (now != null && (now != was || reannounce)) add(ViewingCommand.Start(now))
        }
        return ViewingStep(after, commands)
    }
}
