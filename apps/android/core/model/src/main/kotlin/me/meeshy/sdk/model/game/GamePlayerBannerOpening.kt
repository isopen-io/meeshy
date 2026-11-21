package me.meeshy.sdk.model.game

/**
 * **Le bandeau du joueur ne paraît qu'à l'OUVERTURE de l'app** (#9536, #18230) : au démarrage à froid, ou au retour
 * au premier plan après une VRAIE absence ; il reste [LINGERS_MS], puis s'en va lentement vers le haut. Changer
 * d'onglet, ouvrir un fil, revenir : rien ne le rouvre, rien ne le prolonge.
 *
 * MIROIR de `GamePlayerBannerOpening` iOS (`packages/MeeshySDK/.../Game/GamePlayerBannerOpening.swift`) et des
 * constantes du web, rejoué sur les cas iOS. Une machine à états PURE sur des instants (millisecondes) : aucune
 * horloge, aucun minuteur. L'hôte dit quand l'app part et revient, demande ce qui reste, et dort ce temps-là.
 */
public data class GamePlayerBannerOpening(
    /** L'instant où le bandeau s'est ouvert pour la dernière fois. */
    val openedAtMs: Long,
    /** Depuis quand l'app est à l'arrière-plan ; `null` tant qu'elle est au premier plan. */
    val awaySinceMs: Long? = null,
) {
    /** L'app passe à l'arrière-plan. Un second signal ne repousse pas l'instant du départ. */
    public fun wentAway(nowMs: Long): GamePlayerBannerOpening = if (awaySinceMs == null) copy(awaySinceMs = nowMs) else this

    /** L'absence en cours est-elle assez longue pour que le retour rouvre le bandeau ? */
    public fun reopensOnReturn(nowMs: Long): Boolean = awaySinceMs != null && nowMs - awaySinceMs >= REAL_ABSENCE_MS

    /** L'app revient au premier plan : le bandeau se rouvre après une vraie absence, sinon il reste comme il était. */
    public fun cameBack(nowMs: Long): GamePlayerBannerOpening =
        if (reopensOnReturn(nowMs)) GamePlayerBannerOpening(openedAtMs = nowMs) else copy(awaySinceMs = null)

    /** Ce qu'il reste à vivre au bandeau ; une horloge qui recule ne le prolonge pas au-delà de [LINGERS_MS]. */
    public fun remainingMs(nowMs: Long): Long = (LINGERS_MS - maxOf(0L, nowMs - openedAtMs)).coerceAtLeast(0L)

    public fun isOpen(nowMs: Long): Boolean = remainingMs(nowMs) > 0

    public companion object {
        /** Le temps pendant lequel le bandeau reste, à l'ouverture. */
        public const val LINGERS_MS: Long = 30_000L

        /** La sortie, lente, vers le haut. */
        public const val EXIT_MS: Long = 1_000L

        /** Une absence est « vraie » à partir de là : un appel ou un aller-retour de quelques secondes ne rouvre rien. */
        public const val REAL_ABSENCE_MS: Long = 300_000L
    }
}
