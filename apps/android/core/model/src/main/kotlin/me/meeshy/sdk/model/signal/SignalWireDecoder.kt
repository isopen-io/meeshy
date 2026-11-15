package me.meeshy.sdk.model.signal

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Décodage STRICT des `data` de les routes Signal. `MeeshyApi.json` coerce (`coerceInputValues`) : un
 * champ de sécurité coercé est une rétrogradation silencieuse (ARCHITECTURE 8.6). Ici un champ
 * connu du mauvais type, ou absent quand il est requis, fait échouer le décodage — jamais de défaut.
 * Une clé inconnue est tolérée (rétrocompatibilité), jamais lue.
 */
object SignalWireDecoder {

    fun bundle(data: JsonObject): SignalPreKeyBundle? {
        val identityKey = data.requiredString("identityKey") ?: return null
        val registrationId = data.requiredInt("registrationId") ?: return null
        val deviceId = data.requiredInt("deviceId") ?: return null
        val signedPreKeyId = data.requiredInt("signedPreKeyId") ?: return null
        val signedPreKeyPublic = data.requiredString("signedPreKeyPublic") ?: return null
        val signedPreKeySignature = data.requiredString("signedPreKeySignature") ?: return null
        val preKeyId = data.optionalInt("preKeyId") ?: return null
        val preKeyPublic = data.optionalString("preKeyPublic") ?: return null
        val kyberId = data.optionalInt("kyberPreKeyId") ?: return null
        val kyberPublic = data.optionalString("kyberPreKeyPublic") ?: return null
        val kyberSignature = data.optionalString("kyberPreKeySignature") ?: return null
        return SignalPreKeyBundle(
            identityKey = identityKey,
            registrationId = registrationId,
            deviceId = deviceId,
            preKeyId = preKeyId.value,
            preKeyPublic = preKeyPublic.value,
            signedPreKeyId = signedPreKeyId,
            signedPreKeyPublic = signedPreKeyPublic,
            signedPreKeySignature = signedPreKeySignature,
            kyberPreKeyId = kyberId.value,
            kyberPreKeyPublic = kyberPublic.value,
            kyberPreKeySignature = kyberSignature.value,
        )
    }

    fun uploadResult(data: JsonObject): SignalPreKeyUploadResult? {
        val registrationId = data.optionalInt("registrationId") ?: return null
        val deviceId = data.optionalInt("deviceId") ?: return null
        val preKeyId = data.optionalInt("preKeyId") ?: return null
        val signedPreKeyId = data.optionalInt("signedPreKeyId") ?: return null
        val message = data.optionalString("message") ?: return null
        return SignalPreKeyUploadResult(
            registrationId = registrationId.value,
            deviceId = deviceId.value,
            preKeyId = preKeyId.value,
            signedPreKeyId = signedPreKeyId.value,
            message = message.value,
        )
    }

    fun establishResult(data: JsonObject): EstablishSessionResult? {
        val message = data.optionalString("message") ?: return null
        return EstablishSessionResult(message = message.value)
    }

    /** Présent-ou-absent : `Some(null)` pour absent/null, `null` (échec) pour un type inattendu. */
    private class Maybe<T>(val value: T?)

    private fun JsonObject.primitive(key: String): JsonElement? = this[key]

    private fun JsonObject.requiredString(key: String): String? {
        val element = primitive(key) as? JsonPrimitive ?: return null
        return element.takeIf { it !is JsonNull && it.isString }?.content
    }

    private fun JsonObject.requiredInt(key: String): Int? {
        val element = primitive(key) as? JsonPrimitive ?: return null
        return element.takeIf { it !is JsonNull && !it.isString }?.intOrNull
    }

    private fun JsonObject.optionalString(key: String): Maybe<String>? {
        val element = primitive(key) ?: return Maybe(null)
        if (element is JsonNull) return Maybe(null)
        return requiredString(key)?.let { Maybe(it) }
    }

    private fun JsonObject.optionalInt(key: String): Maybe<Int>? {
        val element = primitive(key) ?: return Maybe(null)
        if (element is JsonNull) return Maybe(null)
        return requiredInt(key)?.let { Maybe(it) }
    }
}
