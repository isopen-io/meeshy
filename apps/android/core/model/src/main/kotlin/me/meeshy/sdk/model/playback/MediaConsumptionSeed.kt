package me.meeshy.sdk.model.playback

import me.meeshy.sdk.model.MeeshyMediaConsumption

/**
 * **La consommation servie d'un vocal, telle que le moteur l'amorce** (`currentUserConsumption` de la passerelle, relevé
 * par la bulle) : où l'écoute s'était arrêtée, sur n'importe quel appareil du compte, et si elle est allée au bout.
 * `null` quand le serveur ne dit rien : le moteur ne reçoit pas une consommation vide qui passerait pour un fait.
 */
public object MediaConsumptionSeed {

    public fun of(lastPlayPositionMs: Int?, listenedComplete: Boolean): MeeshyMediaConsumption? {
        val position = lastPlayPositionMs?.takeIf { it >= 0 }
        if (position == null && !listenedComplete) return null
        return MeeshyMediaConsumption(lastPlayPositionMs = position, listenedComplete = listenedComplete)
    }
}
