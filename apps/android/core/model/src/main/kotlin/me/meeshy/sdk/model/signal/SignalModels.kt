package me.meeshy.sdk.model.signal

import kotlinx.serialization.Serializable

/**
 * Le paquet de pré-clés Signal d'un utilisateur — `signalPreKeyBundleSchema`
 * (`packages/shared/types/api-schemas/signal.ts`). C'est la MÊME forme dans les
 * deux sens : le corps de `POST /signal/keys` (le client publie le sien) et la
 * `data` de `GET /signal/keys/{userId}` (il lit celui d'un autre).
 *
 * Seules les parties PUBLIQUES voyagent ; les clés privées ne quittent jamais
 * l'appareil. [toString] n'imprime pourtant aucune valeur : un journal ou un
 * rapport de crash ne doit pas devenir l'endroit où l'on retrouve des clés.
 */
@Serializable
data class SignalPreKeyBundle(
    val identityKey: String,
    val registrationId: Int,
    val deviceId: Int,
    val preKeyId: Int? = null,
    val preKeyPublic: String? = null,
    val signedPreKeyId: Int,
    val signedPreKeyPublic: String,
    val signedPreKeySignature: String,
    val kyberPreKeyId: Int? = null,
    val kyberPreKeyPublic: String? = null,
    val kyberPreKeySignature: String? = null,
) {
    override fun toString(): String = "SignalPreKeyBundle(registrationId=$registrationId, deviceId=$deviceId)"
}

/** `data` de `POST /signal/keys` — l'écho des identifiants publiés. */
@Serializable
data class SignalPreKeyUploadResult(
    val registrationId: Int? = null,
    val deviceId: Int? = null,
    val preKeyId: Int? = null,
    val signedPreKeyId: Int? = null,
    val message: String? = null,
)

/** Corps de `POST /signal/session/establish` — `establishSessionRequestSchema`. */
@Serializable
data class EstablishSessionRequest(
    val recipientUserId: String,
    val conversationId: String,
)

/** `data` de `POST /signal/session/establish`. */
@Serializable
data class EstablishSessionResult(
    val message: String? = null,
)
