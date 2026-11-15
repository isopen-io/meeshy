package me.meeshy.sdk.model.session

/** Pourquoi l'appareil est purgé : seule une invalidation SERVEUR peut faire perdre des envois que l'utilisateur ignore. */
enum class PurgeCause { USER_LOGOUT, SERVER_INVALIDATION, SIGNED_OUT_AT_LAUNCH }

/** Verdict d'une purge : [purge] est toujours vrai ; [lostSends] n'est non nul que si l'utilisateur doit en être prévenu. */
data class PurgeDecision(val purge: Boolean, val lostSends: Int) {
    val warnLostSends: Boolean get() = lostSends > 0
}

/**
 * Loi de purge de déconnexion (iOS `DependencyContainer`) : la purge est INCONDITIONNELLE ; un avertissement
 * (« N envois en attente perdus ») n'accompagne qu'une invalidation serveur avec une file non vide, jamais une
 * déconnexion volontaire. Au lancement, on purge un appareil déjà déconnecté, jamais une session valide.
 */
object LogoutPurgePolicy {
    fun decide(cause: PurgeCause, pendingSends: Int): PurgeDecision {
        val pending = pendingSends.coerceAtLeast(0)
        val lost = if (cause == PurgeCause.SERVER_INVALIDATION) pending else 0
        return PurgeDecision(purge = true, lostSends = lost)
    }

    fun purgeAtLaunch(hasSession: Boolean): Boolean = !hasSession
}
