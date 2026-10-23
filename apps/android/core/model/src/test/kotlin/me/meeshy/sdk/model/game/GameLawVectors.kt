package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.testutil.SharedFixtures
import me.meeshy.sdk.testutil.stringOrNull

/** Rejeu des vecteurs `game.vectors.json` d'UNE loi : chaque test fournit ce que sa loi rend. */
internal object GameLawVectors {

    class Case(val label: String, val input: JsonObject, val expected: JsonObject) {
        fun str(key: String): String = input[key]!!.jsonPrimitive.content
        fun int(key: String): Int = input[key]!!.jsonPrimitive.intOrNull!!
        fun strOrNull(key: String): String? = input.stringOrNull(key)
        fun ints(key: String): List<Int> = (input[key] as? JsonArray)?.map { it.jsonPrimitive.intOrNull!! }.orEmpty()
    }

    fun cases(law: String): List<Case> =
        SharedFixtures.vectors("reading-modes/game.vectors.json")
            .filter { it.input["law"]?.jsonPrimitive?.content == law }
            .map { Case(it.label.orEmpty(), it.input, it.expected as JsonObject) }
            .also { assertWithMessage("aucun vecteur pour $law").that(it).isNotEmpty() }

    fun JsonElement?.intValue(): Int? = if (this == null || this is JsonNull) null else jsonPrimitive.intOrNull
    fun JsonElement?.doubleValue(): Double = this!!.jsonPrimitive.doubleOrNull!!
    fun JsonElement?.boolValue(): Boolean = this!!.jsonPrimitive.booleanOrNull!!
    fun JsonElement?.text(): String = this!!.jsonPrimitive.content
    fun JsonElement?.array(): JsonArray = this!!.jsonArray
    fun JsonElement?.obj(): JsonObject = this!!.jsonObject
}
