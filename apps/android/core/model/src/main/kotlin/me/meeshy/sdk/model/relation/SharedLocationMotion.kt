package me.meeshy.sdk.model.relation

/**
 * `SHARED_LOCATION_MOTIONS` (#19887, #20665) : ce que fait la personne quand sa position part — immobile, à pied, en
 * courant, à vélo, en voiture. Iso `SharedLocationMotion.swift`. ADDITIF : il voyage dans la position servie, et la
 * passerelle ne le sert qu'au lecteur à la précision exacte ; un mouvement inconnu se lit absent.
 */
public enum class SharedLocationMotion(public val wire: String) {
    STATIONARY("stationary"),
    WALKING("walking"),
    RUNNING("running"),
    CYCLING("cycling"),
    AUTOMOTIVE("automotive");

    public companion object {
        /** Au-delà, le mouvement ne dit plus ce que fait la personne : la liste seule rejoue le dernier point avec son heure. */
        public const val FRESH_FOR_MILLIS: Long = 5L * 60_000L

        public fun of(wire: String?): SharedLocationMotion? = entries.firstOrNull { it.wire == wire }

        /** Le mouvement à montrer pour une position servie à [updatedAtMillis] : `null` dès qu'elle a cinq minutes. */
        public fun shown(motion: SharedLocationMotion?, updatedAtMillis: Long, nowMillis: Long): SharedLocationMotion? =
            motion?.takeIf { nowMillis - updatedAtMillis < FRESH_FOR_MILLIS }

        /** Le mouvement qui se DESSINE : immobile ne se dessine pas, l'absence de glyphe le dit déjà. */
        public fun drawn(motion: SharedLocationMotion?): SharedLocationMotion? = motion?.takeIf { it != STATIONARY }
    }
}
