package me.meeshy.sdk.model.auth

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Un compte de moins de 13 ans ne se connecte pas (miroir de iOS `AgeGateSignal`, #9927, #9929). La passerelle répond 403
 * `AGE_BELOW_MINIMUM` à la connexion, au lien magique et au rafraîchissement : ce refus n'est ni une erreur de saisie ni une
 * session expirée, il appelle UN écran quel que soit le chemin qui l'a reçu. Tout autre 403 reste local à son écran.
 */
object AgeGateSignal {
    const val CODE: String = "AGE_BELOW_MINIMUM"

    /** `true` UNIQUEMENT pour un 403 portant le code. */
    fun isAgeRefusal(statusCode: Int, body: String?): Boolean {
        if (statusCode != 403 || body.isNullOrBlank()) return false
        val payload = runCatching { Json.parseToJsonElement(body) as? JsonObject }.getOrNull() ?: return false
        return (payload["code"] as? JsonPrimitive)?.takeIf { it.isString }?.content == CODE
    }
}
