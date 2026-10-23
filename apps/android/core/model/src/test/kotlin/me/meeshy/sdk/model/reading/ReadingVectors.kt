package me.meeshy.sdk.model.reading

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.testutil.SharedFixtures

/** Une entrée de `reading-modes/*.vectors.json` : `{ _label, input, expected, ... }`. */
class ReadingVector(val label: String, val body: JsonObject) {
    val input: JsonObject get() = body.getValue("input").jsonObject
    val expected: JsonElement get() = body.getValue("expected")
}

object ReadingVectors {
    /** Les vecteurs d'un fichier dont la racine est un tableau, ou un objet `{ vectors: [...] }`. */
    fun load(name: String): List<ReadingVector> {
        val root = Json.parseToJsonElement(SharedFixtures.file("reading-modes/$name").readText())
        val cases: JsonArray = if (root is JsonArray) root else root.jsonObject.getValue("vectors").jsonArray
        return cases.mapIndexed { index, case ->
            val obj = case.jsonObject
            ReadingVector(obj["_label"]?.jsonPrimitive?.contentOrNull ?: "#$index", obj)
        }
    }

    fun capabilities(json: JsonObject): ReadingModeCapabilities {
        val reason = json.getValue("riverEligibilityReason").jsonObject
        return ReadingModeCapabilities(
            availableModes = json.getValue("availableModes").jsonArray.map {
                requireNotNull(ConversationReadingMode.fromWire(it.jsonPrimitive.content))
            },
            riverEligible = json.getValue("riverEligible").jsonPrimitive.boolean,
            riverEligibilityReason = RiverEligibilityReason(
                threshold = reason.getValue("threshold").jsonPrimitive.int,
                current = reason["current"]?.jsonPrimitive?.intOrNull,
                riverReason = requireNotNull(
                    RiverEligibilityReasonKind.fromWire(reason.getValue("riverReason").jsonPrimitive.content),
                ),
            ),
        )
    }

    /** Égalité JSON structurelle, les nombres comparés en valeur (`1` == `1.0`). */
    fun assertJsonEquals(label: String, expected: JsonElement?, actual: JsonElement?, path: String = "$") {
        val where = "$label @ $path"
        when {
            expected == null || expected is JsonNull ->
                check(actual == null || actual is JsonNull) { "$where : attendu null, obtenu $actual" }
            expected is JsonObject -> {
                check(actual is JsonObject) { "$where : attendu un objet, obtenu $actual" }
                check(expected.keys == actual.keys) { "$where : clés ${actual.keys} ≠ attendues ${expected.keys}" }
                expected.forEach { (key, value) -> assertJsonEquals(label, value, actual[key], "$path.$key") }
            }
            expected is JsonArray -> {
                check(actual is JsonArray) { "$where : attendu un tableau, obtenu $actual" }
                check(expected.size == actual.size) { "$where : taille ${actual.size} ≠ ${expected.size}" }
                expected.indices.forEach { assertJsonEquals(label, expected[it], actual[it], "$path[$it]") }
            }
            expected is JsonPrimitive -> {
                check(actual is JsonPrimitive) { "$where : attendu une valeur, obtenu $actual" }
                val e = expected.contentOrNull
                val a = actual.contentOrNull
                val en = e?.toDoubleOrNull()
                val an = a?.toDoubleOrNull()
                if (!expected.isString && en != null && an != null) {
                    check(Math.abs(en - an) < 1e-9) { "$where : $a ≠ $e" }
                } else {
                    check(e == a) { "$where : $a ≠ $e" }
                }
            }
        }
    }
}
