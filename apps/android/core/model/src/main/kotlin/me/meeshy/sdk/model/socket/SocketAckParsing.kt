package me.meeshy.sdk.model.socket

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import me.meeshy.sdk.model.feedback.DailyGestureLimit

/**
 * Lecture unique d'un accusé Socket.IO. Miroir de `SocketAck.parse` (iOS). Totale : rien ne lève.
 *
 * - premier argument absent ou qui n'est pas un objet JSON (« NO ACK », chaîne) : [SocketAck.Timeout] ;
 * - `success` différent de `true` : [SocketAck.Refused], `error` objet ou chaîne ;
 * - sinon [SocketAck.Accepted] avec la charge de [SocketAckPayloadSource].
 */
object SocketAckParsing {

    private val json = Json { isLenient = true; ignoreUnknownKeys = true }

    /** Lit l'accusé rendu comme JSON brut (`null` quand aucun accusé n'est arrivé). */
    fun parse(rawJson: String?, source: SocketAckPayloadSource = SocketAckPayloadSource.AUTO): SocketAck<JsonObject> {
        val root = rawJson?.let { runCatching { json.parseToJsonElement(it) }.getOrNull() }
        return parse(root as? JsonObject, source)
    }

    fun parse(response: JsonObject?, source: SocketAckPayloadSource = SocketAckPayloadSource.AUTO): SocketAck<JsonObject> {
        response ?: return SocketAck.Timeout
        if (!response.isSuccess()) {
            return SocketAck.Refused(refusal(response))
        }
        val payload = when (source) {
            SocketAckPayloadSource.NONE -> null
            SocketAckPayloadSource.ROOT -> response
            SocketAckPayloadSource.DATA -> response["data"] as? JsonObject
            SocketAckPayloadSource.AUTO -> response["data"] as? JsonObject ?: response
        }
        return SocketAck.Accepted(payload)
    }

    /** `error` objet : `code` / `message` / `endReason` ; `error` chaîne : le message. Le code de la racine prime. */
    fun refusal(response: JsonObject): SocketAckRefusal {
        val error = response["error"]
        val errorObject = error as? JsonObject
        val errorCode = errorObject?.string("code")
        return SocketAckRefusal(
            code = response.string("code") ?: errorCode,
            message = errorObject?.string("message") ?: (error as? JsonPrimitive)?.takeIf { it.isString }?.content,
            retryAfter = (response.number("retryAfter") ?: errorObject?.number("retryAfter"))?.let { seconds(it) },
            resetAt = DailyGestureLimit.parseInstant(response.string("resetAt") ?: errorObject?.string("resetAt")),
            limit = response.number("limit")?.toInt(),
            errorCode = errorCode,
            endReason = errorObject?.string("endReason"),
        )
    }

    private fun JsonObject.isSuccess(): Boolean = (this["success"] as? JsonPrimitive)?.let { !it.isString && it.booleanOrNull == true } == true

    private fun seconds(raw: Double): Int? = raw.takeIf { it.isFinite() }?.let { kotlin.math.ceil(it).toInt() }

    private fun JsonObject.string(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull

    private fun JsonObject.number(key: String): Double? = (this[key] as? JsonPrimitive)?.takeIf { !it.isString }?.let { it.intOrNull?.toDouble() ?: it.doubleOrNull }

}
