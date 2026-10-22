package me.meeshy.sdk.model.lens

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Une valeur JSON EXACTE : un booléen n'est jamais un nombre, `null` n'est jamais une absence
 * (ce que JavaScript distingue et que le contrat v1 exige).
 */
public sealed interface LensJsonValue {
    public data object Null : LensJsonValue
    public data class Bool(val value: Boolean) : LensJsonValue
    public data class Num(val value: Double) : LensJsonValue
    public data class Str(val value: String) : LensJsonValue
    public data class Arr(val items: List<LensJsonValue>) : LensJsonValue
    public data class Obj(val fields: Map<String, LensJsonValue>) : LensJsonValue

    public companion object {
        /** Lit un texte JSON ; `null` si ce n'est pas du JSON (jamais d'exception). */
        public fun parse(source: String): LensJsonValue? =
            try {
                from(Json.parseToJsonElement(source))
            } catch (_: Exception) {
                null
            }

        public fun from(element: JsonElement): LensJsonValue = when (element) {
            is JsonNull -> Null
            is JsonObject -> Obj(element.mapValues { from(it.value) })
            is JsonArray -> Arr(element.map(::from))
            is JsonPrimitive -> fromPrimitive(element)
        }

        private fun fromPrimitive(primitive: JsonPrimitive): LensJsonValue {
            if (primitive.isString) return Str(primitive.content)
            return when (primitive.content) {
                "true" -> Bool(true)
                "false" -> Bool(false)
                else -> primitive.content.toDoubleOrNull()?.let(::Num) ?: Str(primitive.content)
            }
        }
    }
}
