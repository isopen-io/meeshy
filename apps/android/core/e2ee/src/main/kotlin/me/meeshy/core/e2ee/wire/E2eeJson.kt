package me.meeshy.core.e2ee.wire

import kotlinx.serialization.json.Json

/**
 * Le JSON des routes `/api/v1/e2ee/...` et du relais : un champ nul n'est pas écrit (comme l'`Encodable` synthétisé de
 * Swift), un champ inconnu de la passerelle est ignoré à la lecture, et AUCUNE coercition — un `deviceId` coercé
 * enverrait une enveloppe ou un retrait vers un autre appareil.
 */
public val E2eeJson: Json = Json {
    explicitNulls = false
    encodeDefaults = true
    ignoreUnknownKeys = true
    coerceInputValues = false
    isLenient = false
}
