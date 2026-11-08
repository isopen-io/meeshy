package me.meeshy.sdk.model.scene

/**
 * Cadence d'écriture d'un binding alimenté par un geste continu — miroir de `BindingWriteCadence`
 * (iOS). Pincer ou tourner un calque réécrivait l'état à la cadence tactile (60 à 120 Hz) et chaque
 * écriture recomposait le composeur entier : 30 Hz suffit à une main, le canevas dessinant à la
 * cadence du doigt depuis sa propre copie.
 */
public object BindingWriteCadence {
    /** 1 / 30 s, arrondie à la milliseconde supérieure. */
    public const val MINIMUM_INTERVAL_MS: Long = 34L

    public sealed interface Decision {
        public data object WriteNow : Decision
        public data class Deferred(val by: Long) : Decision
    }

    public fun decide(now: Long, lastWrite: Long?): Decision {
        if (lastWrite == null) return Decision.WriteNow
        val remaining = MINIMUM_INTERVAL_MS - (now - lastWrite)
        return if (remaining > 0) Decision.Deferred(remaining) else Decision.WriteNow
    }
}

/**
 * Écrit à front montant, puis garde la DERNIÈRE valeur reçue pour le front descendant : la valeur
 * finale d'un geste part toujours, au plus tard un intervalle après le lâcher. Les valeurs
 * intermédiaires d'une rafale sont écrasées. Pas thread-safe : à appeler depuis un seul fil
 * (le fil principal), comme son miroir `@MainActor`.
 *
 * [schedule] planifie `run` après `delay` ms et rend l'annulation.
 */
public class BindingWriteThrottle<Value>(
    private val write: (Value) -> Unit,
    private val clock: () -> Long,
    private val schedule: (delayMs: Long, run: () -> Unit) -> (() -> Unit),
) {
    private var lastWrite: Long? = null
    private var pending: Value? = null
    private var hasPending: Boolean = false
    private var cancelTrailing: (() -> Unit)? = null

    public fun submit(value: Value) {
        val now = clock()
        when (val decision = BindingWriteCadence.decide(now, lastWrite)) {
            BindingWriteCadence.Decision.WriteNow -> {
                disarm()
                pending = null
                hasPending = false
                lastWrite = now
                write(value)
            }
            is BindingWriteCadence.Decision.Deferred -> {
                pending = value
                hasPending = true
                if (cancelTrailing == null) {
                    cancelTrailing = schedule(decision.by) { flush() }
                }
            }
        }
    }

    /** Écrit la valeur en attente et désarme le front de queue ; rend `true` si une valeur attendait. Idempotent. */
    public fun flush(): Boolean {
        disarm()
        if (!hasPending) return false
        @Suppress("UNCHECKED_CAST")
        val value = pending as Value
        pending = null
        hasPending = false
        lastWrite = clock()
        write(value)
        return true
    }

    private fun disarm() {
        cancelTrailing?.invoke()
        cancelTrailing = null
    }
}
