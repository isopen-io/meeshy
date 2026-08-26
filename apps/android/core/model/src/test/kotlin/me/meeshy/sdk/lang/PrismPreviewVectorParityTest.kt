package me.meeshy.sdk.lang

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

/**
 * Rejeu Android du fichier de vecteurs partagé
 * `packages/shared/fixtures/reading-modes/prism-preview.vectors.json` — le CONTRAT
 * cross-plateforme de la résolution du Prisme sur l'aperçu de dernier message
 * (CLAUDE.md § *Prisme Linguistique*, règle #3). TS le rejoue
 * (`packages/shared/__tests__/vectors/prism-preview.vectors.test.ts`) et iOS aussi
 * (`apps/ios/MeeshyTests/Unit/Lentille/PrismPreviewVectorTests.swift`).
 *
 * Les trois clients rendent la MÊME ligne depuis le MÊME payload REST, et chacun
 * portait jusqu'ici sa propre suite écrite À LA MAIN se déclarant « one-for-one
 * mirror » des deux autres — l'en-tête de [LastMessagePreviewResolverTest] le dit
 * mot pour mot. Une parité affirmée en prose, gardée par rien : c'est le trou « N
 * miroirs, zéro témoin de parité » (leçons 291/292), et c'est sous cette absence
 * qu'`ApiConversation` a jadis jeté `lastMessageTranslations` sans que rien ne
 * rougisse (cycle 118). Ce fichier remplace la prose par un témoin machine.
 *
 * **API réelle rejouée** — [resolveLastMessagePreview] (`me.meeshy.sdk.lang`),
 * le chemin exact que la ligne de liste consomme en production, jamais une
 * réimplémentation locale de la boucle dans ce fichier.
 */
class PrismPreviewVectorParityTest {

    // Le fichier de vecteurs vit hors du module Android, à la racine du dépôt.
    // Le répertoire de travail des tests JVM Gradle est soit le module, soit la
    // racine Android — on remonte donc l'arborescence jusqu'à le trouver, comme
    // AccentVectorParityTest.
    private fun fixtureFile(): File {
        val relative = "packages/shared/fixtures/reading-modes/prism-preview.vectors.json"
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, relative)
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        error(
            "prism-preview.vectors.json introuvable en remontant depuis ${File("").absolutePath} " +
                "(cherché: $relative)",
        )
    }

    private data class Vector(
        val label: String?,
        val preview: String?,
        val translations: Map<String, String>?,
        val originalLanguage: String?,
        val preferredLanguages: List<String>,
        val expected: String?,
    )

    private fun asStringOrNull(element: JsonElement?): String? =
        if (element == null || element is JsonNull) null else element.jsonPrimitive.contentOrNull

    private fun loadVectors(): List<Vector> {
        val root = Json.parseToJsonElement(fixtureFile().readText()).jsonObject
        val vectors = root["vectors"]?.jsonArray
            ?: error("prism-preview.vectors.json : clé `vectors` absente ou non-tableau")
        return vectors.map { element ->
            val obj = element.jsonObject
            val input = obj["input"]!!.jsonObject
            val translationsElement = input["translations"]
            val translations: Map<String, String>? =
                if (translationsElement == null || translationsElement is JsonNull) {
                    null
                } else {
                    translationsElement.jsonObject.mapValues { it.value.jsonPrimitive.content }
                }
            Vector(
                label = asStringOrNull(obj["_label"]),
                preview = asStringOrNull(input["preview"]),
                translations = translations,
                originalLanguage = asStringOrNull(input["originalLanguage"]),
                preferredLanguages = input["preferredLanguages"]!!.jsonArray
                    .map { it.jsonPrimitive.content },
                expected = asStringOrNull(obj["expected"]),
            )
        }
    }

    // --- Garde de harnais (leçon 257 : jamais de vert silencieux à zéro cas) ---

    @Test
    fun `loads twenty-two vectors, never zero`() {
        val vectors = loadVectors()
        assertThat(vectors).isNotEmpty()
        // Re-preuve du compte au moment de l'écriture. Un changement doit être
        // investigué avant d'ajuster ce nombre.
        assertThat(vectors).hasSize(22)
    }

    // --- 22 vecteurs → resolveLastMessagePreview (égalité stricte) ---

    @Test
    fun `every vector matches resolveLastMessagePreview exactly`() {
        val vectors = loadVectors()
        assertThat(vectors).isNotEmpty()

        for (v in vectors) {
            val actual = resolveLastMessagePreview(
                preview = v.preview,
                translations = v.translations,
                originalLanguage = v.originalLanguage,
                preferredLanguages = v.preferredLanguages,
            )
            assertWithMessage("cas «${v.label ?: "?"}»").that(actual).isEqualTo(v.expected)
        }
    }
}
