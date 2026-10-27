package me.meeshy.sdk.model.reading.river

import java.time.Instant
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.testutil.SharedFixtures

/**
 * Décodage des vecteurs `fixtures/reading-modes/river-*.vectors.json` (générés en EXÉCUTANT la loi
 * TypeScript) vers les types Kotlin, et lecture de leurs attendus. Site unique du décodage : aucun
 * test de la Rivière ne le réécrit.
 */
internal object RiverVectorFixtures {

    const val LANES = "reading-modes/river-lanes.vectors.json"
    const val STEP = "reading-modes/river-step.vectors.json"
    const val HEADERS = "reading-modes/river-headers.vectors.json"

    private fun JsonElement?.stringOrNull(): String? = if (this == null || this is JsonNull) null else jsonPrimitive.contentOrNull

    /** Un horodatage ISO-8601 illisible vaut NaN, comme `new Date("…").getTime()` côté TS. */
    private fun epochMs(raw: String): Double = runCatching { Instant.parse(raw).toEpochMilli().toDouble() }.getOrDefault(Double.NaN)

    fun lanesInput(json: JsonObject): ResolveRiverLanesInput = ResolveRiverLanesInput(
        messages = json.getValue("messages").jsonArray.map { it.jsonObject }.map { message ->
            RiverMessageInput(
                id = message.getValue("id").jsonPrimitive.content,
                senderId = message.getValue("senderId").jsonPrimitive.content,
                createdAtMs = epochMs(message.getValue("createdAt").jsonPrimitive.content),
                replyToMessageId = message["replyToMessageId"].stringOrNull(),
                isSystem = message["isSystem"]?.jsonPrimitive?.boolean ?: false,
            )
        },
        participants = json.getValue("participants").jsonArray.map { it.jsonObject }.map {
            RiverParticipantInput(it.getValue("id").jsonPrimitive.content, it.getValue("displayName").jsonPrimitive.content)
        },
        viewerId = json.getValue("viewerId").jsonPrimitive.content,
        silenceWindowMs = json["silenceWindowMs"]?.jsonPrimitive?.double,
        maxLanes = json["maxLanes"]?.jsonPrimitive?.int,
        minVoices = json["minVoices"]?.jsonPrimitive?.int,
        dayBoundaryOffsetMinutes = json["dayBoundaryOffsetMinutes"]?.jsonPrimitive?.double,
    )

    fun cursor(json: JsonObject): RiverCursor =
        RiverCursor(json.getValue("laneIndex").jsonPrimitive.int, json.getValue("rank").jsonPrimitive.int)

    private fun JsonArray.objects(): List<JsonObject> = map { it.jsonObject }

    private fun JsonObject.string(key: String): String = getValue(key).jsonPrimitive.content
    private fun JsonObject.int(key: String): Int = getValue(key).jsonPrimitive.int
    private fun JsonObject.bool(key: String): Boolean = getValue(key).jsonPrimitive.boolean

    /** La géométrie ATTENDUE, décodée depuis le JSON — comparée par égalité de valeur à la sortie réelle. */
    fun geometry(json: JsonObject): RiverGeometry = RiverGeometry(
        lanes = json.getValue("lanes").jsonArray.objects().map { lane ->
            RiverLane(
                laneId = lane.string("laneId"),
                laneIndex = lane.int("laneIndex"),
                isViewer = lane.bool("isViewer"),
                colorSeed = lane.string("colorSeed"),
                spans = lane.getValue("spans").jsonArray.objects().map { span ->
                    RiverLaneSpan(
                        startRank = span.int("startRank"),
                        endRank = span.int("endRank"),
                        isOpen = span.bool("isOpen"),
                        nodes = span.getValue("nodes").jsonArray.objects().map {
                            RiverNode(it.int("rank"), nodeKind(it.string("kind")), it.string("messageId"))
                        },
                    )
                },
            )
        },
        bubbles = json.getValue("bubbles").jsonArray.objects().map {
            RiverBubble(
                messageId = it.string("messageId"),
                laneId = it.string("laneId"),
                laneIndex = it.int("laneIndex"),
                rank = it.int("rank"),
                createdAtMs = it.getValue("createdAtMs").jsonPrimitive.double,
                isViewer = it.bool("isViewer"),
                replyToMessageId = it["replyToMessageId"].stringOrNull(),
                isFirstInGroup = it.bool("isFirstInGroup"),
                isSystem = it.bool("isSystem"),
            )
        },
        connectors = json.getValue("connectors").jsonArray.objects().map {
            RiverConnector(
                it.string("fromMessageId"), it.string("toMessageId"),
                it.int("fromLaneIndex"), it.int("toLaneIndex"), it.int("fromRank"), it.int("toRank"),
            )
        },
        rankCount = json.int("rankCount"),
        laneCount = json.int("laneCount"),
        voiceCount = json.int("voiceCount"),
        layout = RiverLayout.entries.first { it.wire == json.string("layout") },
        serializationReason = json["serializationReason"].stringOrNull()?.let { wire ->
            RiverSerializationReason.entries.first { it.wire == wire }
        },
        silenceWindowMs = json.getValue("silenceWindowMs").jsonPrimitive.double,
        maxLanes = json.int("maxLanes"),
        minVoices = json.int("minVoices"),
    )

    private fun nodeKind(wire: String): RiverNodeKind = RiverNodeKind.entries.first { it.wire == wire }

    fun headers(json: JsonArray): List<RiverLaneHeader> = json.objects().map {
        RiverLaneHeader(
            laneIndex = it.int("laneIndex"),
            laneId = it.string("laneId"),
            colorSeed = it.string("colorSeed"),
            isViewer = it.bool("isViewer"),
            alpha = it.getValue("alpha").jsonPrimitive.double,
        )
    }

    fun vectors(relative: String): List<SharedFixtures.Vector> = SharedFixtures.vectors(relative)

}
