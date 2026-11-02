package me.meeshy.sdk.net

import java.util.concurrent.atomic.AtomicLong

/**
 * L'état de transition de session, lisible par la couche réseau sans dépendre de
 * `:sdk-core`. Pendant une bascule de compte ou la sortie du compte actif, un refus
 * d'authentification tardif ne doit toucher ni renouveler quoi que ce soit ; la
 * [generation] change à chaque nouvelle session, ce qui périme les requêtes parties sous
 * la précédente.
 */
public class SessionTransitionFlags {
    @Volatile
    public var isSwitchingAccount: Boolean = false

    @Volatile
    public var isLeavingActiveSession: Boolean = false

    private val counter = AtomicLong(0)

    public val generation: Long get() = counter.get()

    public val isTransitioning: Boolean get() = isSwitchingAccount || isLeavingActiveSession

    /** Une nouvelle session commence (connexion, bascule, sortie) : les anciennes requêtes sont périmées. */
    public fun bumpGeneration(): Long = counter.incrementAndGet()
}
