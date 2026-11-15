package me.meeshy.sdk.model

/**
 * Les marquages « lu » dont CET appareil est l'auteur — miroir de `NotificationSelfReadLedger` (iOS).
 *
 * La passerelle diffuse `notification:read` à tous les appareils du compte, l'auteur compris : le client ne peut pas
 * distinguer son écho de celui d'un autre appareil. Une clé reste réclamable pendant [windowMillis] et n'est PAS
 * retirée à la première réclamation (la passerelle peut ré-émettre) ; passé ce délai, un écho est l'annonce d'une
 * lecture faite AILLEURS et s'applique.
 *
 * Pur : `now` est un paramètre, la fenêtre se témoigne sans attendre.
 */
class NotificationSelfReadLedger(private val windowMillis: Long = DEFAULT_WINDOW_MILLIS) {

    private val readAt = HashMap<String, Long>()

    @Synchronized
    fun register(key: String, now: Long) {
        if (key.isBlank()) return
        purge(now)
        readAt[key] = now
    }

    /** Le réseau a refusé : l'écho qui suivrait (il n'y en aura pas) ne doit plus être ignoré. */
    @Synchronized
    fun forget(key: String) {
        readAt.remove(key)
    }

    /** `true` quand cet écho est le NÔTRE : l'appelant l'ignore. */
    @Synchronized
    fun claimsEcho(key: String, now: Long): Boolean {
        purge(now)
        return readAt.containsKey(key)
    }

    /** Déconnexion : un compte ne lègue pas ses lectures au suivant. */
    @Synchronized
    fun clear() {
        readAt.clear()
    }

    private fun purge(now: Long) {
        readAt.entries.removeAll { now - it.value >= windowMillis }
    }

    companion object {
        const val DEFAULT_WINDOW_MILLIS: Long = 30_000
    }
}
