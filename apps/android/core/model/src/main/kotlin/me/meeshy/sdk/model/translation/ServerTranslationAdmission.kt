package me.meeshy.sdk.model.translation

import me.meeshy.sdk.model.ApiMessage

/**
 * Aucun texte clair ne part vers la traduction SERVEUR d'un message que le serveur ne lit pas
 * (#11214, fail-closed). La conversation ET le message le disent
 * ([DeviceTranslationEligibility.serverReadsMessage]) ; un régime inconnu se lit comme un
 * régime qu'il ne lit pas. `conversationEncryptionMode` est exigé à chaque appel, sans défaut :
 * un défaut l'aurait ouvert. La traduction y passe par l'appareil. Miroir de
 * `ServerTranslationAdmission` (iOS).
 */
public object ServerTranslationAdmission {

    /** Clé du libellé affiché quand la traduction serveur est refusée (catalogue iOS). */
    public const val REFUSAL_MESSAGE_KEY: String = "message.translation.e2ee.serverRefused"

    /** Message inconnu (`null`) : seul le mode de la conversation décide. */
    public fun admits(message: ApiMessage?, conversationEncryptionMode: String?): Boolean =
        DeviceTranslationEligibility.serverReadsMessage(
            conversationEncryptionMode = conversationEncryptionMode,
            isEncrypted = message?.isEncrypted ?: false,
            encryptionMode = message?.encryptionMode,
        )

    /** Hors conversation (plein écran audio, galerie) : la pièce chiffrée compte aussi. */
    public fun admitsOutsideConversation(message: ApiMessage): Boolean =
        admits(message, conversationEncryptionMode = null) &&
            message.attachments.none { it.isEncrypted == true }
}
