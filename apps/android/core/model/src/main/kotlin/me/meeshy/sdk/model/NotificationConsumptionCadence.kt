package me.meeshy.sdk.model

/**
 * La cadence du marquage serveur d'une conversation ou d'un post consommé : au plus UN POST par clé et par fenêtre de
 * [windowMillis], jamais deux en vol — miroir de `markConversationNotificationsRead` iOS (cooldown de cinq secondes).
 *
 * Chaque slide de story est un post distinct, et une conversation se rouvre en rafale : sans ce garde-fou chaque
 * ouverture enverrait sa requête. Le garde protège la REQUÊTE, jamais le geste local (cache, vues, compteur), qui part
 * toujours.
 */
class NotificationConsumptionCadence(private val windowMillis: Long = DEFAULT_WINDOW_MILLIS) {

    private val inFlight = HashSet<String>()
    private val stamps = HashMap<String, Long>()

    /** `true` : la requête peut partir (la clé est alors en vol jusqu'à [finish]). */
    @Synchronized
    fun tryBegin(key: String, now: Long): Boolean {
        if (key in inFlight) return false
        val last = stamps[key]
        if (last != null && now - last < windowMillis) return false
        inFlight += key
        return true
    }

    /**
     * Libère la clé. [stamp] vrai (la requête a abouti) ouvre la fenêtre ; faux (échec) laisse la clé immédiatement
     * rejouable. Les horodatages échus sont élagués : ils ne bloquent plus rien.
     */
    @Synchronized
    fun finish(key: String, now: Long, stamp: Boolean) {
        inFlight -= key
        stamps.entries.removeAll { now - it.value >= windowMillis }
        if (stamp) stamps[key] = now
    }

    /** Déconnexion : un compte ne lègue pas ses fenêtres au suivant. */
    @Synchronized
    fun clear() {
        inFlight.clear()
        stamps.clear()
    }

    companion object {
        const val DEFAULT_WINDOW_MILLIS: Long = 5_000
    }
}
