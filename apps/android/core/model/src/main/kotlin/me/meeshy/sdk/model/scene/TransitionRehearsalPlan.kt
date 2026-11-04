package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StoryTransitionEffect

/**
 * Le plan d'une répétition des transitions en composition (iOS `StoryTransitionRehearsal`, #8792) : ouverture, une courte
 * pause sur la scène entière, fermeture, puis retour à l'état neutre. Pur, sans horloge ni calque : aucun moteur neuf, la
 * pose vient de [SceneRootTransitionPose], la même courbe que la lecture.
 */
public data class TransitionRehearsalPlan(
    val opening: StoryTransitionEffect?,
    val closing: StoryTransitionEffect?,
) {
    public sealed interface Phase {
        public data object Opening : Phase
        public data object Hold : Phase
        public data class Closing(val progress: Double) : Phase
        public data object Finished : Phase
    }

    public val isEmpty: Boolean get() = opening == null && closing == null

    /** Début de la fermeture : l'ouverture (si choisie) puis la pause sur la scène entière. */
    public val closingStartSeconds: Double
        get() = (if (opening == null) 0.0 else TRANSITION_SECONDS) + HOLD_SECONDS

    public val totalDurationSeconds: Double
        get() = closingStartSeconds + if (closing == null) 0.0 else TRANSITION_SECONDS

    public fun phaseAt(elapsed: Double): Phase = when {
        opening != null && elapsed < TRANSITION_SECONDS -> Phase.Opening
        elapsed < closingStartSeconds -> Phase.Hold
        closing == null || elapsed >= totalDurationSeconds -> Phase.Finished
        else -> Phase.Closing(((elapsed - closingStartSeconds) / TRANSITION_SECONDS).coerceIn(0.0, 1.0))
    }

    /** La pose de la racine du canvas à [elapsed] ; neutre pendant la pause et une fois la répétition finie. */
    public fun poseAt(elapsed: Double): SceneRootPose = when (val phase = phaseAt(elapsed)) {
        Phase.Opening -> SceneRootTransitionPose.opening(opening, elapsed)
        is Phase.Closing -> SceneRootTransitionPose.closing(closing, TRANSITION_SECONDS, phase.progress * TRANSITION_SECONDS)
        Phase.Hold, Phase.Finished -> SceneRootPose.NEUTRAL
    }

    public companion object {
        public const val HOLD_SECONDS: Double = 0.6
        public const val TRANSITION_SECONDS: Double = SceneRootTransitionPose.DURATION_SECONDS
    }
}

/**
 * Une répétition EN COURS : son plan et son horloge. L'horloge démarre au PREMIER échantillon, jamais à la création : un
 * choix qui occupe le fil principal le temps d'une image aurait sinon déjà consommé l'ouverture quand l'écran la montre.
 */
public class TransitionRehearsalRun(public val plan: TransitionRehearsalPlan) {
    private var startedAtNanos: Long? = null

    public fun elapsedAt(nowNanos: Long): Double {
        val start = startedAtNanos ?: nowNanos.also { startedAtNanos = it }
        return (nowNanos - start) / NANOS_PER_SECOND
    }

    public fun phaseAt(nowNanos: Long): TransitionRehearsalPlan.Phase = plan.phaseAt(elapsedAt(nowNanos))

    public fun poseAt(nowNanos: Long): SceneRootPose = plan.poseAt(elapsedAt(nowNanos))

    private companion object {
        const val NANOS_PER_SECOND: Double = 1_000_000_000.0
    }
}

/**
 * Le détenteur d'une répétition : choisir un effet l'interrompt et la reprend de zéro ; sans effet, ou hors mode édition,
 * il n'y a rien à répéter.
 */
public object TransitionRehearsal {
    public fun start(opening: StoryTransitionEffect?, closing: StoryTransitionEffect?, editing: Boolean = true): TransitionRehearsalRun? =
        TransitionRehearsalPlan(opening, closing).takeIf { editing && !it.isEmpty }?.let(::TransitionRehearsalRun)
}
