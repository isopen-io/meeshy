package me.meeshy.sdk.model.call.group

/**
 * Qui parle, dans un appel de groupe — miroir de iOS `ActiveSpeakerDetector`.
 *
 * Nourri, toutes les [SAMPLING_INTERVAL_MILLIS], des niveaux `audioLevel` (0…1) des statistiques `inbound-rtp`
 * audio de chaque connexion (le pair principal et chaque lien du maillage). Hystérésis : on entre au-dessus de
 * [enterLevel], on ne sort qu'après [holdMillis] passées sous [exitLevel] — sans elle, le liseré clignoterait entre
 * deux syllabes. Valeur immuable : chaque relevé rend un nouveau détecteur.
 */
data class ActiveSpeakerDetector(
    val enterLevel: Double = ENTER_LEVEL,
    val exitLevel: Double = EXIT_LEVEL,
    val holdMillis: Long = HOLD_MILLIS,
    /** Dernier instant où chaque locuteur actif était au-dessus de [exitLevel]. */
    val lastLoud: Map<String, Long> = emptyMap(),
) {
    val speakers: Set<String> get() = lastLoud.keys

    fun isSpeaking(userId: String): Boolean = userId in lastLoud

    /** Un relevé : [levels] porte le niveau de chaque membre mesuré à [nowMillis]. Un absent garde son état jusqu'à expiration du maintien. */
    fun recording(levels: Map<String, Double>, nowMillis: Long): ActiveSpeakerDetector {
        val refreshed = HashMap(lastLoud)
        levels.forEach { (userId, level) ->
            val threshold = if (userId in lastLoud) exitLevel else enterLevel
            if (level >= threshold) refreshed[userId] = nowMillis
        }
        val alive = refreshed.filterValues { nowMillis - it <= holdMillis }
        return if (alive == lastLoud) this else copy(lastLoud = alive)
    }

    fun forgetting(userId: String): ActiveSpeakerDetector =
        if (userId in lastLoud) copy(lastLoud = lastLoud - userId) else this

    companion object {
        const val ENTER_LEVEL: Double = 0.06
        const val EXIT_LEVEL: Double = 0.03
        const val HOLD_MILLIS: Long = 800
        const val SAMPLING_INTERVAL_MILLIS: Long = 400
    }
}
