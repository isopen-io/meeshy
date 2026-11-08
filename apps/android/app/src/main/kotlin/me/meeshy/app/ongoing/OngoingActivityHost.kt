package me.meeshy.app.ongoing

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.ongoing.LiveActivityPlan
import me.meeshy.sdk.model.ongoing.OngoingActivityKind
import me.meeshy.sdk.model.ongoing.OngoingActivityLaw
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/** Où l'hôte pose, remplace et retire les notifications en cours ; séparé pour se jouer sans système. */
internal interface OngoingSurface {
    fun show(plan: LiveActivityPlan)
    fun conclude(plan: LiveActivityPlan, dismissAfterMs: Long)
    fun cancel(kind: OngoingActivityKind)
    fun cancelUnknown(keep: Set<OngoingActivityKind>)
}

/**
 * **L'exécution des notifications en cours**, commune aux cinq types (miroir de `LiveActivityHost` iOS).
 *
 * L'hôte GARDE ce qu'il a ouvert : savoir si une activité tourne ([isRunning]) est une lecture locale,
 * synchrone, jamais une question au système. Chaque demande est réduite par [OngoingActivityLaw] sous
 * verrou, puis son effet est exécuté par UN seul consommateur, dans l'ordre exact des demandes : une
 * mise à jour qui part après une fermeture ne ressuscite pas la notification.
 */
@Singleton
internal class OngoingActivityHost internal constructor(
    private val surface: OngoingSurface,
    scope: CoroutineScope,
) {
    @Inject
    constructor(surface: OngoingSurface) : this(surface, CoroutineScope(SupervisorJob() + Dispatchers.Default))

    private val lock = Any()
    private var state = OngoingActivityLaw.State()
    private val effects = Channel<OngoingActivityLaw.Effect>(Channel.UNLIMITED)

    init {
        scope.launch {
            for (effect in effects) {
                try {
                    execute(effect)
                } catch (failure: Exception) {
                    Timber.w(failure, "notification en cours non appliquée")
                }
            }
        }
    }

    fun isRunning(kind: OngoingActivityKind): Boolean = synchronized(lock) { state.isRunning(kind) }

    fun start(plan: LiveActivityPlan) = submit(OngoingActivityLaw.Request.Start(plan))

    fun update(plan: LiveActivityPlan) = submit(OngoingActivityLaw.Request.Update(plan))

    /** Ferme [kind] ; avec [outcome], l'issue reste affichée [dismissAfterMs] puis se retire seule. */
    fun end(kind: OngoingActivityKind, outcome: LiveActivityPlan? = null, dismissAfterMs: Long = 0L) =
        submit(OngoingActivityLaw.Request.End(kind, outcome, dismissAfterMs))

    /** Retire ce qu'une session précédente a laissé : à appeler au démarrage du processus. */
    fun endOrphans() = submit(OngoingActivityLaw.Request.EndOrphans)

    private fun submit(request: OngoingActivityLaw.Request) {
        synchronized(lock) {
            val step = OngoingActivityLaw.reduce(state, request)
            state = step.state
            if (step.effect != OngoingActivityLaw.Effect.None) effects.trySend(step.effect)
        }
    }

    private fun execute(effect: OngoingActivityLaw.Effect) {
        when (effect) {
            OngoingActivityLaw.Effect.None -> Unit
            is OngoingActivityLaw.Effect.Show -> surface.show(effect.plan)
            is OngoingActivityLaw.Effect.Conclude -> surface.conclude(effect.plan, effect.dismissAfterMs)
            is OngoingActivityLaw.Effect.Cancel -> surface.cancel(effect.kind)
            is OngoingActivityLaw.Effect.CancelUnknown -> surface.cancelUnknown(effect.keep)
        }
    }
}
