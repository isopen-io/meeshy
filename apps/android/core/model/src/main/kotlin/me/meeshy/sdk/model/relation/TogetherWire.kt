package me.meeshy.sdk.model.relation

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Un événement « ensemble » reçu, dans son type. Un seul flux garde l'ordre du fil. */
public sealed interface TogetherInbound {
    public data class Invited(val data: TogetherInvited) : TogetherInbound
    public data class Started(val data: TogetherStarted) : TogetherInbound
    public data class Synced(val data: TogetherSynced) : TogetherInbound
    public data class Ended(val data: TogetherEnded) : TogetherInbound
}

/**
 * Ce qui sort vers la passerelle et ce qui en entre, sans socket (#17100) : la socket Android n'a plus qu'à porter ces
 * charges. Miroir de `TogetherSocketEmitter` et `MessageSocketRoutes.together` (iOS). Le schéma serveur est STRICT
 * (`packages/shared/types/together.ts`) : aucune clé de plus ne part.
 */
public object TogetherWire {
    /** Les quatre événements serveur → client, sur la room `user:<id>`. */
    public val INBOUND: List<String> = listOf(
        TogetherEvents.INVITED,
        TogetherEvents.STARTED,
        TogetherEvents.SYNCED,
        TogetherEvents.ENDED,
    )

    public fun invitePayload(toUserId: String, conversationId: String, attachmentId: String): JsonObject = buildJsonObject {
        put("toUserId", toUserId)
        put("conversationId", conversationId)
        put("attachmentId", attachmentId)
    }

    /** `together:join` et `together:leave`. */
    public fun sessionPayload(sessionId: String): JsonObject = buildJsonObject { put("sessionId", sessionId) }

    /** Le serveur n'accepte qu'un entier dans [0, 24 h] : la position se borne et s'arrondit ICI, comme sur iOS. */
    public fun syncPayload(sessionId: String, playing: Boolean, positionMs: Double): JsonObject = buildJsonObject {
        put("sessionId", sessionId)
        put("playing", playing)
        put("positionMs", boundedPosition(positionMs))
    }

    /** L'état que le serveur a retenu, ou `null` (refus, accusé absent ou illisible) : la séance garde l'état précédent. */
    public fun syncAck(ack: JsonElement?): TogetherPlayback? {
        val o = ack as? JsonObject ?: return null
        val success = (o["success"] as? JsonPrimitive)?.takeIf { !it.isString }?.content == "true"
        if (!success) return null
        return TogetherPlayback.read((o["data"] as? JsonObject)?.get("playback"))
    }

    public fun inbound(event: String, payload: JsonElement?): TogetherInbound? = when (event) {
        TogetherEvents.INVITED -> TogetherInvited.read(payload)?.let(TogetherInbound::Invited)
        TogetherEvents.STARTED -> TogetherStarted.read(payload)?.let(TogetherInbound::Started)
        TogetherEvents.SYNCED -> TogetherSynced.read(payload)?.let(TogetherInbound::Synced)
        TogetherEvents.ENDED -> TogetherEnded.read(payload)?.let(TogetherInbound::Ended)
        else -> null
    }

    private fun boundedPosition(positionMs: Double): Long {
        val finite = if (positionMs.isFinite()) positionMs else 0.0
        return Math.round(finite.coerceIn(0.0, TogetherContract.MAX_POSITION_MS))
    }
}
