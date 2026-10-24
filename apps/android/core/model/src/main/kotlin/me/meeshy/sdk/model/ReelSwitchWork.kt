package me.meeshy.sdk.model

/**
 * Ce qu'un passage de réel à réel a le droit de faire, selon la phase (#10354) —
 * miroir de `ReelSwitchWork`. Pendant le geste : pause du sortant et, si le
 * lecteur est déjà attaché, lecture de l'entrant ; rien d'autre. Une fois posé :
 * tout le reste, déplacé et jamais retiré.
 */
public enum class ReelSwitchWork {
    PAUSE_OUTGOING,
    PLAY_ATTACHED_PLAYER,
    LOAD_ENGINE,
    CONFIGURE_SESSION,
    COORDINATE_PLAYBACK,
    REPORT_WATCH,
    CONFIGURE_PIP,
    REFRESH_POOL,
    START_SCENE,
    START_AUDIO,
    MOUNT_ACTIVE_CHROME,
    ;

    public enum class Phase { GESTURE, SETTLED }

    public sealed interface Kind {
        /** [attachedPlayer] : sa surface tient déjà un lecteur prêt. */
        public data class Video(val attachedPlayer: Boolean) : Kind
        public data object Scene : Kind
        public data object Audio : Kind
        public data object Image : Kind
    }

    public companion object {
        public fun permitted(phase: Phase, kind: Kind): Set<ReelSwitchWork> = when (phase) {
            Phase.GESTURE ->
                if (kind is Kind.Video && kind.attachedPlayer) setOf(PAUSE_OUTGOING, PLAY_ATTACHED_PLAYER)
                else setOf(PAUSE_OUTGOING)
            Phase.SETTLED -> settledWork(kind)
        }

        private fun settledWork(kind: Kind): Set<ReelSwitchWork> {
            val common = setOf(PAUSE_OUTGOING, REPORT_WATCH, MOUNT_ACTIVE_CHROME)
            return when (kind) {
                is Kind.Video -> common + setOf(LOAD_ENGINE, CONFIGURE_SESSION, COORDINATE_PLAYBACK, CONFIGURE_PIP, REFRESH_POOL)
                Kind.Scene -> common + setOf(START_SCENE, CONFIGURE_SESSION)
                Kind.Audio -> common + setOf(START_AUDIO, CONFIGURE_SESSION, COORDINATE_PLAYBACK)
                Kind.Image -> common
            }
        }

        public fun mayPlayAttachedPlayer(
            ready: Boolean,
            revealCompleted: Boolean,
            isCallActive: Boolean,
            hasAttachedPlayer: Boolean,
        ): Boolean = ready && revealCompleted && !isCallActive && hasAttachedPlayer

        /** `null` : la page ne joue pas (non élue). */
        public fun phase(isElected: Boolean, isSettled: Boolean): Phase? {
            if (!isElected) return null
            return if (isSettled) Phase.SETTLED else Phase.GESTURE
        }

        /** Élue ET posée engage le média ; la perte de l'élection désengage tout de suite. */
        public fun engages(isElected: Boolean, isSettled: Boolean): Boolean =
            phase(isElected, isSettled) == Phase.SETTLED
    }
}

/** La barre de lecture ne revendique que l'axe horizontal (#10354). */
public object ReelScrubAxis {
    public const val MINIMUM_DISTANCE_DP: Float = 6f

    public fun claims(dx: Float, dy: Float, alreadySeeking: Boolean): Boolean =
        alreadySeeking || kotlin.math.abs(dx) > kotlin.math.abs(dy)
}

/**
 * Le délai entre l'élection d'un réel et son premier média qui joue : chaque
 * passage se mesure une fois, un départ pour un autre réel ne rend rien.
 */
public data class ReelSwitchMeter(
    val pendingId: String? = null,
    private val electedAtMs: Long = 0L,
) {
    public fun elect(id: String, atMs: Long): ReelSwitchMeter = copy(pendingId = id, electedAtMs = atMs)

    /** Rend le nouvel état et la durée en ms (`null` si ce départ n'est pas mesuré). */
    public fun mediaStarted(id: String, atMs: Long): Pair<ReelSwitchMeter, Long?> {
        if (pendingId != id) return this to null
        return copy(pendingId = null) to (atMs - electedAtMs)
    }
}
