package me.meeshy.sdk.translation.device

import me.meeshy.sdk.model.translation.DeviceTranslationPair

/**
 * La règle « une demande, une fois par couple et par session » : un refus ou un échec retenu rend
 * le couple non supporté pour toute la session, jamais deux demandes. Thread-safe.
 */
class DownloadConsentPolicy {
    private val asked = mutableSetOf<DeviceTranslationPair>()
    private val blocked = mutableSetOf<DeviceTranslationPair>()

    /** Vrai une seule fois par couple : l'appelant affiche alors la demande. */
    @Synchronized
    fun shouldAsk(pair: DeviceTranslationPair): Boolean =
        pair !in blocked && asked.add(pair)

    /** Le refus ou l'échec : le couple est non supporté jusqu'à la fin de la session. */
    @Synchronized
    fun remember(pair: DeviceTranslationPair) {
        asked += pair
        blocked += pair
    }

    @Synchronized
    fun isBlocked(pair: DeviceTranslationPair): Boolean = pair in blocked
}
