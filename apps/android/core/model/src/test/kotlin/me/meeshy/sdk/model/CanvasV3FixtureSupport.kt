package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject

internal object CanvasV3FixtureSupport {
    fun fixtureText(name: String): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val candidate = File(dir, "packages/shared/fixtures/canvas-v3/$name.json")
            if (candidate.isFile) return candidate.readText()
            dir = dir.parentFile
        }
        throw AssertionError("Fixture partagée introuvable : canvas-v3/$name.json")
    }

    fun fixture(name: String): JsonObject = Json.parseToJsonElement(fixtureText(name)).jsonObject

    /** Égalité exacte des valeurs : un nombre vaut sa valeur décimale, pas son écriture (`1` = `1.0`). */
    fun assertSameJson(expected: JsonElement, actual: JsonElement, path: String = "$") {
        when {
            expected is JsonObject && actual is JsonObject -> {
                assertWithMessage("clés de $path").that(actual.keys).isEqualTo(expected.keys)
                expected.forEach { (key, value) -> assertSameJson(value, actual.getValue(key), "$path.$key") }
            }
            expected is JsonArray && actual is JsonArray -> {
                assertWithMessage("taille de $path").that(actual.size).isEqualTo(expected.size)
                expected.indices.forEach { assertSameJson(expected[it], actual[it], "$path[$it]") }
            }
            expected is JsonPrimitive && actual is JsonPrimitive && !expected.isString && expected !is JsonNull -> {
                val e = expected.doubleOrNull
                val a = actual.doubleOrNull
                if (e != null) assertWithMessage(path).that(a).isEqualTo(e)
                else assertWithMessage(path).that(actual.content).isEqualTo(expected.content)
            }
            else -> assertWithMessage(path).that(actual).isEqualTo(expected)
        }
    }
}
