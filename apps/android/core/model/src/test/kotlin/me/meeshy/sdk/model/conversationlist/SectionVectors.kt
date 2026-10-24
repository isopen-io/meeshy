package me.meeshy.sdk.model.conversationlist

import java.time.Instant
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.testutil.SharedFixtures

internal object SectionVectors {

    fun cases(name: String): List<JsonObject> =
        Json.parseToJsonElement(SharedFixtures.file("reading-modes/$name").readText())
            .jsonArray.map { it.jsonObject }

    fun label(case: JsonObject): String = case["_label"]?.jsonPrimitive?.contentOrNull.orEmpty()

    fun conversations(input: JsonObject): List<SectionableConversation> =
        (input["conversations"] as JsonArray).map { conversation(it.jsonObject) }

    private fun JsonElement?.textOrNull(): String? =
        if (this == null || this is JsonNull) null else jsonPrimitive.contentOrNull

    private fun conversation(o: JsonObject) = SectionableConversation(
        id = o["id"].textOrNull()!!,
        isPinned = o["isPinned"]!!.jsonPrimitive.boolean,
        categoryId = o["categoryId"].textOrNull(),
        orderInCategory = o["orderInCategory"].textOrNull()?.let { o["orderInCategory"]!!.jsonPrimitive.double },
        lastMessageAtMillis = o["lastMessageAt"].textOrNull()?.let { Instant.parse(it).toEpochMilli() },
        updatedAtMillis = Instant.parse(o["updatedAt"].textOrNull()!!).toEpochMilli(),
        liveCall = o["liveCall"]?.takeIf { it !is JsonNull }?.let { SectionableLiveCall },
    )
}
