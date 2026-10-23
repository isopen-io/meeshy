package me.meeshy.sdk.call

import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton

/**
 * « Un appel est en cours » : l'unique interrupteur que la pile temps réel consulte avant de
 * couper la socket de signalisation (rotation de jeton, déconnexion). Couper la socket au milieu
 * d'un appel perdrait offre, réponses et candidats ICE ; l'opération est donc DIFFÉRÉE jusqu'à la
 * fin de l'appel puis rejouée une seule fois (la dernière demande l'emporte).
 *
 * Miroir du comportement iOS où la session d'appel garde la connexion tant qu'elle est active.
 */
@Singleton
public class CallActivityGate @Inject constructor() {
    private val active = AtomicBoolean(false)
    private val lock = Any()
    private var pending: (() -> Unit)? = null

    public val isActive: Boolean get() = active.get()

    /** Bascule l'état ; le passage à `false` rejoue l'opération différée, hors verrou. */
    public fun setActive(value: Boolean) {
        val replay = synchronized(lock) {
            active.set(value)
            if (value) null else pending.also { pending = null }
        }
        replay?.invoke()
    }

    /**
     * Exécute [action] tout de suite hors appel (rend `true`) ; pendant un appel la retient,
     * remplaçant une demande précédente, et rend `false`.
     */
    public fun runOrDefer(action: () -> Unit): Boolean {
        val deferred = synchronized(lock) {
            if (active.get()) {
                pending = action
                true
            } else {
                false
            }
        }
        if (!deferred) action()
        return !deferred
    }
}
