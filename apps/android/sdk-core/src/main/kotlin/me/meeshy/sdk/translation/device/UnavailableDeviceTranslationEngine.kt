package me.meeshy.sdk.translation.device

import me.meeshy.sdk.model.translation.DeviceTranslationPair

/** Le moteur des appareils sans Play Services : l'appareil ne traduit rien, sans aucune erreur. */
class UnavailableDeviceTranslationEngine : DeviceTranslationEngine {
    override val engineName: String = "unavailable"

    override suspend fun availability(pair: DeviceTranslationPair): DeviceTranslationAvailability =
        DeviceTranslationAvailability.UNSUPPORTED

    override suspend fun translate(
        requests: List<DeviceTranslationRequest>,
        pair: DeviceTranslationPair,
    ): List<DeviceTranslationResult> = emptyList()

    override fun cancelPending() = Unit
}
