package me.meeshy.sdk.model.game

/**
 * QUAND UN NIVEAU EST « GAGNÉ » (#9381) : la tape légère ne joue que pour une montée CONFIRMÉE. Miroir de
 * `GameLevelConfirmation` (iOS).
 *
 * Une frappe baisse le niveau tout de suite (optimiste) ; si elle est refusée, le niveau d'avant revient : le chiffre
 * MONTE, mais rien n'a été gagné. On compare au dernier niveau CONFIRMÉ — celui lu quand aucun geste n'était en vol —
 * et l'on ne juge qu'une fois les gestes réglés : une montée vraie arrivée PENDANT un geste (le coffre) se joue à son
 * règlement, pas avant.
 */
public class GameLevelConfirmation(confirmed: Int) {
    public var confirmed: Int = confirmed
        private set

    /** `true` quand [level] dépasse le dernier niveau confirmé, une fois [settled]. */
    public fun observe(level: Int, settled: Boolean): Boolean {
        if (!settled) return false
        val climbed = level > confirmed
        confirmed = level
        return climbed
    }
}
