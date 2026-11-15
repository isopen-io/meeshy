package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.SharedPlace

/**
 * Le sort de la tuile de lieu du composeur après un envoi (iOS `SendPlaceTileLaw`, #4948) : instantané, retrait
 * IMMÉDIAT (avec le vidage du texte), restauration seulement si l'envoi échoue. Un lieu envoyé seul ne reste jamais dans
 * le composeur en attendant l'accusé.
 */
public object SendPlaceTileLaw {

    public enum class Outcome { CLEARED, RESTORED }

    /** [sent] = accusé reçu OU mise en file durable : le lieu est parti. */
    public fun outcome(sent: Boolean): Outcome = if (sent) Outcome.CLEARED else Outcome.RESTORED

    /**
     * Ce que le composeur reprend après l'envoi, `null` = rien à remettre. Un lieu choisi PENDANT l'envoi ([current]) est
     * plus récent que l'instantané : un échec ne l'écrase jamais.
     */
    public fun restoration(snapshot: SharedPlace?, sent: Boolean, current: SharedPlace?): SharedPlace? =
        if (outcome(sent) == Outcome.RESTORED && current == null) snapshot else null
}
