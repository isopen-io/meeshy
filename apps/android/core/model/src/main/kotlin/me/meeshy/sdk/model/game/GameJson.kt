package me.meeshy.sdk.model.game

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.serializer

/**
 * Lecture TOLÉRANTE du fil du Jeu, partagée par les parseurs du bloc, des
 * écritures et des refus. Deux familles :
 *  - `req*` : champ REQUIS — absent ou mal typé, elles lèvent [GameParseException]
 *    que le parseur de plus haut niveau attrape (le bloc est alors `null`,
 *    jamais à moitié lu) ;
 *  - `opt*` : champ OPTIONNEL — absent, `null` ou illisible rendent `null`,
 *    sans jamais lever (un serveur antérieur ne le sert pas, un serveur plus
 *    récent peut l'avoir changé).
 */
internal class GameParseException(message: String) : IllegalArgumentException(message)

private fun JsonElement?.primitive(): JsonPrimitive? =
    (this as? JsonPrimitive)?.takeUnless { it is JsonNull }

private fun JsonElement?.long(): Long? = primitive()?.takeUnless { it.isString }?.longOrNull

private fun JsonElement?.int(): Int? = long()?.takeIf { it in Int.MIN_VALUE..Int.MAX_VALUE }?.toInt()

private fun JsonElement?.double(): Double? = primitive()?.takeUnless { it.isString }?.doubleOrNull

private fun JsonElement?.bool(): Boolean? = primitive()?.takeUnless { it.isString }?.booleanOrNull

private fun JsonElement?.string(): String? = primitive()?.takeIf { it.isString }?.content

private fun missing(key: String): Nothing = throw GameParseException(key)

internal fun JsonObject.reqInt(key: String): Int = this[key].int() ?: missing(key)

internal fun JsonObject.reqLong(key: String): Long = this[key].long() ?: missing(key)

internal fun JsonObject.reqDouble(key: String): Double = this[key].double() ?: missing(key)

internal fun JsonObject.reqBool(key: String): Boolean = this[key].bool() ?: missing(key)

internal fun JsonObject.reqString(key: String): String = this[key].string() ?: missing(key)

internal fun JsonObject.reqObject(key: String): JsonObject = this[key] as? JsonObject ?: missing(key)

internal fun JsonObject.reqArray(key: String): JsonArray = this[key] as? JsonArray ?: missing(key)

internal fun JsonObject.optInt(key: String): Int? = this[key].int()

internal fun JsonObject.optLong(key: String): Long? = this[key].long()

internal fun JsonObject.optDouble(key: String): Double? = this[key].double()

internal fun JsonObject.optBool(key: String): Boolean? = this[key].bool()

internal fun JsonObject.optString(key: String): String? = this[key].string()

internal fun JsonObject.optObject(key: String): JsonObject? = this[key] as? JsonObject

/** Un compte d'étincelles ou de points : entier ≥ 0, absent ou illisible ⇒ `null`. */
internal fun JsonObject.optCount(key: String): Int? = optInt(key)?.coerceAtLeast(0)

internal fun JsonObject.optCountLong(key: String): Long? = optLong(key)?.coerceAtLeast(0L)

/**
 * Champ NULLABLE mais strict : absent ou `null` ⇒ `null`, présent et d'un autre
 * type ⇒ échec (comme `decodeIfPresent` côté iOS).
 */
internal fun JsonObject.nullableInt(key: String): Int? {
    val element = this[key] ?: return null
    if (element is JsonNull) return null
    return element.int() ?: missing(key)
}

internal fun JsonObject.nullableLong(key: String): Long? {
    val element = this[key] ?: return null
    if (element is JsonNull) return null
    return element.long() ?: missing(key)
}

internal fun JsonObject.nullableString(key: String): String? {
    val element = this[key] ?: return null
    if (element is JsonNull) return null
    return element.string() ?: missing(key)
}

internal fun JsonObject.nullableObject(key: String): JsonObject? {
    val element = this[key] ?: return null
    if (element is JsonNull) return null
    return element as? JsonObject ?: missing(key)
}

/** Les chaînes d'un tableau ; tout élément qui n'en est pas une fait échouer le tableau. */
internal fun JsonArray.strings(key: String): List<String> =
    map { it.string() ?: missing(key) }

/**
 * Une clé de la liste fermée du Jeu, lue depuis le `@SerialName` de l'énumération
 * — l'unique source du nom sur le fil. Inconnue ⇒ `null` (l'appelant décide si
 * c'est fatal : palier, rang ; ou toléré : édition d'une Meesh).
 */
@OptIn(ExperimentalSerializationApi::class)
internal inline fun <reified E : Enum<E>> enumFromWire(raw: String?): E? {
    if (raw == null) return null
    val descriptor = serializer<E>().descriptor
    val index = (0 until descriptor.elementsCount).firstOrNull { descriptor.getElementName(it) == raw } ?: return null
    return enumValues<E>()[index]
}

internal inline fun <reified E : Enum<E>> JsonObject.reqEnum(key: String): E =
    enumFromWire<E>(reqString(key)) ?: missing(key)

internal inline fun <reified E : Enum<E>> JsonObject.nullableEnum(key: String): E? {
    val raw = nullableString(key) ?: return null
    return enumFromWire<E>(raw) ?: missing(key)
}

/** Un parseur de sous-objet qui se tait : illisible ⇒ `null`, sans emporter le parent. */
internal fun <T> JsonObject.lenient(key: String, parse: (JsonObject) -> T): T? {
    val obj = this[key] as? JsonObject ?: return null
    return try {
        parse(obj)
    } catch (_: GameParseException) {
        null
    } catch (_: IllegalArgumentException) {
        null
    }
}
