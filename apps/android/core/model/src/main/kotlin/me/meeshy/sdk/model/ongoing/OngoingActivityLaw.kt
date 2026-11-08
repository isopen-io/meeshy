package me.meeshy.sdk.model.ongoing

/**
 * **L'ordre d'une notification en cours.** Pure : l'état courant et une demande entrent, le nouvel
 * état et ce que l'hôte doit exécuter sortent. Les demandes arrivent de plusieurs fils ; l'hôte les
 * applique dans l'ordre où elles ont été faites, et cette loi garantit qu'une mise à jour qui arrive
 * APRÈS une fermeture ne ressuscite rien (iOS : `LiveActivityHost.update` sans activité = sans effet).
 */
object OngoingActivityLaw {

    data class State(val running: Map<OngoingActivityKind, LiveActivityPlan> = emptyMap()) {
        fun isRunning(kind: OngoingActivityKind): Boolean = kind in running
    }

    sealed interface Request {
        data class Start(val plan: LiveActivityPlan) : Request
        data class Update(val plan: LiveActivityPlan) : Request
        data class End(val kind: OngoingActivityKind, val outcome: LiveActivityPlan?, val dismissAfterMs: Long) : Request
        data object EndOrphans : Request
    }

    sealed interface Effect {
        data object None : Effect
        data class Show(val plan: LiveActivityPlan) : Effect
        data class Conclude(val plan: LiveActivityPlan, val dismissAfterMs: Long) : Effect
        data class Cancel(val kind: OngoingActivityKind) : Effect
        /** Retire toute notification en cours que l'hôte ne reconnaît pas (reste d'une session précédente). */
        data class CancelUnknown(val keep: Set<OngoingActivityKind>) : Effect
    }

    data class Step(val state: State, val effect: Effect)

    fun reduce(state: State, request: Request): Step = when (request) {
        is Request.Start -> start(state, request.plan)
        is Request.Update -> update(state, request.plan)
        is Request.End -> end(state, request)
        Request.EndOrphans -> Step(state, Effect.CancelUnknown(state.running.keys))
    }

    private fun start(state: State, plan: LiveActivityPlan): Step {
        val next = State(state.running + (plan.kind to plan))
        return Step(next, if (state.running[plan.kind] == plan) Effect.None else Effect.Show(plan))
    }

    private fun update(state: State, plan: LiveActivityPlan): Step {
        val current = state.running[plan.kind] ?: return Step(state, Effect.None)
        if (current == plan) return Step(state, Effect.None)
        return Step(State(state.running + (plan.kind to plan)), Effect.Show(plan))
    }

    private fun end(state: State, request: Request.End): Step {
        if (request.kind !in state.running) return Step(state, Effect.None)
        val next = State(state.running - request.kind)
        val outcome = request.outcome
        return Step(
            next,
            if (outcome != null && request.dismissAfterMs > 0L) {
                Effect.Conclude(outcome, request.dismissAfterMs)
            } else {
                Effect.Cancel(request.kind)
            },
        )
    }
}
