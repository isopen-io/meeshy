package me.meeshy.sdk.translation.device

import me.meeshy.sdk.model.translation.DeviceTranslationPair

/** Ce que l'appareil sait faire d'un couple de langues (miroir de `DeviceTranslationAvailability` iOS). */
enum class DeviceTranslationAvailability {
    /** Les modèles sont sur l'appareil : traduction immédiate, hors ligne. */
    READY,

    /** Couple pris en charge, modèles à télécharger : une demande, une fois par couple et par session. */
    NEEDS_DOWNLOAD,

    /** Le moteur ne traduit pas ce couple (refus, échec, pas de Play Services). */
    UNSUPPORTED,
}

/** Un texte à traduire ; [id] revient tel quel sur le résultat. */
data class DeviceTranslationRequest(val id: String, val text: String)

data class DeviceTranslationResult(val id: String, val text: String)

/**
 * Un moteur de traduction sur l'appareil (#9899). Aucune erreur ne remonte : un texte non traduit
 * est ABSENT du résultat et l'appelant retombe sur le rang suivant du Prisme.
 */
interface DeviceTranslationEngine {
    /** Écrit dans l'enveloppe partagée (`engine`) ; entre 1 et 64 caractères. */
    val engineName: String

    suspend fun availability(pair: DeviceTranslationPair): DeviceTranslationAvailability

    /** Traduit un lot ; les textes absents du résultat n'ont pas été traduits. */
    suspend fun translate(
        requests: List<DeviceTranslationRequest>,
        pair: DeviceTranslationPair,
    ): List<DeviceTranslationResult>

    /** Abandonne ce qui est en attente : les appels en cours rendent aussitôt ce qu'ils ont. */
    fun cancelPending()
}
