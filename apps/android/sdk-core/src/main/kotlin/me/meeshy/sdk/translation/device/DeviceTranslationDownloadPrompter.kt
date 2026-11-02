package me.meeshy.sdk.translation.device

import me.meeshy.sdk.model.translation.DeviceTranslationPair

/** Ce que la boîte de dialogue sobre annonce : le couple, la taille du modèle, Wi-Fi par défaut. */
data class DeviceTranslationDownloadRequest(
    val pair: DeviceTranslationPair,
    val approximateSizeMb: Int,
    val wifiOnly: Boolean,
)

/**
 * La couture vers l'interface : demande à l'utilisateur d'autoriser le téléchargement. Rend `true`
 * pour accepter (le choix Wi-Fi seulement revient dans [DeviceTranslationDownloadDecision]).
 */
fun interface DeviceTranslationDownloadPrompter {
    suspend fun ask(request: DeviceTranslationDownloadRequest): DeviceTranslationDownloadDecision

    companion object {
        /** Sans interface liée, jamais de téléchargement silencieux : la demande est déclinée. */
        val Declining: DeviceTranslationDownloadPrompter =
            DeviceTranslationDownloadPrompter { DeviceTranslationDownloadDecision.Declined }
    }
}

sealed interface DeviceTranslationDownloadDecision {
    data class Accepted(val wifiOnly: Boolean = true) : DeviceTranslationDownloadDecision
    data object Declined : DeviceTranslationDownloadDecision
}
