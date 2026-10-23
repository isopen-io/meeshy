package me.meeshy.sdk.model.game.engagement

/**
 * La file des paliers à célébrer — un à l'écran, les suivants attendent. MIROIR de `EngagementRevealQueue.swift`.
 *
 * PURE et bornée : pure, elle se teste sans monter une vue ; bornée ([CAPACITY], [MEMORY]), parce qu'une célébration
 * qu'on ne peut pas fermer avant d'en avoir vu six est une prise en otage — au-delà, les paliers restent ACQUIS et
 * le tableau de bord les restitue.
 */
public data class EngagementRevealQueue(
    val current: EngagementReveal? = null,
    val waiting: List<EngagementReveal> = emptyList(),
    /** Les derniers paliers montrés, du plus ancien au plus récent. */
    val alreadyShown: List<EngagementReveal> = emptyList(),
    /** Vrai tant qu'un calque (onboarding) recouvre l'écran : les paliers attendent, rien n'est perdu. */
    val isSuspended: Boolean = false,
) {
    val isEmpty: Boolean get() = current == null && waiting.isEmpty()

    /**
     * Enfile un palier, ou l'ignore. Déduplication par VALEUR (un même succès arrive par deux portes), et elle
     * survit à la FERMETURE : les deux portes sont séparées par une fermeture.
     */
    public fun enqueue(reveal: EngagementReveal): EngagementRevealQueue {
        if (reveal == current || reveal in waiting || reveal in alreadyShown) return this
        if ((if (current == null) 0 else 1) + waiting.size >= CAPACITY) return this
        return if (current == null && !isSuspended) copy(current = reveal) else copy(waiting = waiting + reveal)
    }

    /** La célébration courante vient d'être refermée : elle entre en mémoire, la suivante prend sa place. */
    public fun finish(): EngagementRevealQueue {
        val shown = current?.let { (alreadyShown + it).takeLast(MEMORY) } ?: alreadyShown
        return if (isSuspended || waiting.isEmpty()) {
            copy(current = null, alreadyShown = shown)
        } else {
            copy(current = waiting.first(), waiting = waiting.drop(1), alreadyShown = shown)
        }
    }

    /** Suspend ou reprend. Suspendre ne retire JAMAIS une célébration déjà à l'écran ; reprendre joue la première. */
    public fun suspend(suspended: Boolean): EngagementRevealQueue {
        val next = copy(isSuspended = suspended)
        if (suspended || next.current != null || next.waiting.isEmpty()) return next
        return next.copy(current = next.waiting.first(), waiting = next.waiting.drop(1))
    }

    public companion object {
        /** Ce que la file accepte de faire attendre, célébration en cours comprise. */
        public const val CAPACITY: Int = 3

        /** Combien de paliers DÉJÀ MONTRÉS la file retient. */
        public const val MEMORY: Int = 3
    }
}
