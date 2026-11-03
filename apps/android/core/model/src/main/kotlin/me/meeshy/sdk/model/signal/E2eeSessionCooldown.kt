package me.meeshy.sdk.model.signal

/**
 * Le cache NÉGATIF des établissements de session E2EE échoués — miroir de
 * `SessionManager.isWithinFailureCooldown` (iOS). Un pair dont l'établissement vient d'échouer n'est pas
 * re-sollicité avant [FAILURE_COOLDOWN_MILLIS] : les routes Signal ont un limiteur de débit serré, et
 * chaque rejeu consomme une pré-clé. La fenêtre est bornée pour qu'une reprise côté serveur soit reprise
 * sans redémarrer l'application. Pendant le délai, l'envoi est REFUSÉ (fail-closed), jamais fait en clair.
 */
object E2eeSessionCooldown {
    /** 600 s : 599 s refusé, 600 s retenté. */
    const val FAILURE_COOLDOWN_MILLIS: Long = 600_000L

    fun isWithinFailureCooldown(
        failedAtEpochMillis: Long?,
        nowEpochMillis: Long,
        cooldownMillis: Long = FAILURE_COOLDOWN_MILLIS,
    ): Boolean {
        if (failedAtEpochMillis == null) return false
        return nowEpochMillis - failedAtEpochMillis < cooldownMillis
    }
}
