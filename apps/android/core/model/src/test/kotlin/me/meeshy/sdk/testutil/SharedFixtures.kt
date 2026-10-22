package me.meeshy.sdk.testutil

import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Rejeu des vecteurs partagés de `packages/shared/fixtures` côté Android.
 *
 * Les lois à miroirs (Prisme, présence, accent, lentille...) sont tenues par un fichier
 * de vecteurs que TS, iOS et Android rejouent contre leur propre implémentation : c'est
 * le témoin machine d'une parité que la prose affirmait sans la garder. Ce helper est le
 * site UNIQUE de leur chargement côté `:core:model` — aucun test ne réécrit la remontée
 * d'arborescence ni le dépouillement JSON.
 *
 * Le fichier vit hors du module Android, à la racine du dépôt. Le répertoire de travail
 * d'un test JVM Gradle est tantôt le module, tantôt la racine Android : on remonte donc
 * l'arborescence jusqu'à trouver `packages/shared/fixtures/<relatif>`, comme
 * `PrismPreviewVectorParityTest`.
 *
 * Le chemin passé est relatif à `packages/shared/fixtures` (`"reading-modes/x.vectors.json"`) ;
 * le préfixe complet `packages/shared/fixtures/` est toléré.
 */
object SharedFixtures {

    private const val FIXTURES_ROOT = "packages/shared/fixtures"

    /** Un vecteur `{ _label, input, expected }` — la forme commune des fichiers `reading-modes`. */
    data class Vector(
        val label: String?,
        val input: JsonObject,
        val expected: JsonElement?,
    )

    /** Le fichier de fixtures [relative], trouvé en remontant depuis le répertoire de travail. */
    fun file(relative: String): File {
        val path = "$FIXTURES_ROOT/${relative.removePrefix("$FIXTURES_ROOT/")}"
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, path)
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        error("fixture partagée introuvable en remontant depuis ${File("").absolutePath} (cherché: $path)")
    }

    /** Le document JSON racine du fichier [relative]. */
    fun root(relative: String): JsonObject =
        Json.parseToJsonElement(file(relative).readText()).jsonObject

    /** Les cas de la clé `vectors` du fichier [relative] ; échoue si elle est absente. */
    fun vectors(relative: String): List<Vector> {
        val cases = root(relative)["vectors"]?.jsonArray
            ?: error("$relative : clé `vectors` absente ou non-tableau")
        return cases.map { case ->
            val obj = case.jsonObject
            Vector(
                label = obj["_label"].stringOrNull(),
                input = obj["input"]?.jsonObject ?: error("$relative : cas sans `input`"),
                expected = obj["expected"],
            )
        }
    }
}

/** La chaîne portée par cet élément, ou `null` pour une absence ou un `null` JSON. */
fun JsonElement?.stringOrNull(): String? =
    if (this == null || this is JsonNull) null else jsonPrimitive.contentOrNull

/** La chaîne de la clé [key], ou `null` si la clé manque ou vaut `null`. */
fun JsonObject.stringOrNull(key: String): String? = this[key].stringOrNull()

/** La liste de chaînes de la clé [key] ; vide si la clé manque ou vaut `null`. */
fun JsonObject.stringList(key: String): List<String> =
    (this[key] as? JsonArray)?.map { it.jsonPrimitive.content }.orEmpty()

/** La carte `clé → chaîne` de la clé [key], ou `null` si la clé manque ou vaut `null`. */
fun JsonObject.stringMapOrNull(key: String): Map<String, String>? =
    (this[key] as? JsonObject)?.mapValues { it.value.jsonPrimitive.content }
