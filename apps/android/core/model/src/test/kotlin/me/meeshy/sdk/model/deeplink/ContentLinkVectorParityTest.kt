package me.meeshy.sdk.model.deeplink

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.testutil.SharedFixtures
import me.meeshy.sdk.testutil.stringOrNull
import org.junit.Test

/**
 * La loi du lien de contenu (#19331) rejouée sur le fichier que le TypeScript (`content-link.test.ts`) et le miroir
 * Swift (`ContentLinkTarget`, MeeshySDK) rejouent aussi : `packages/shared/fixtures/content-link/content-link.vectors.json`.
 * Un hôte, un chemin ou une forme d'identifiant ajouté à l'un se voit chez les deux autres.
 */
class ContentLinkVectorParityTest {

    private data class Vector(val label: String, val input: String, val expected: ContentLinkTarget?)

    private val vectors: List<Vector> =
        Json.parseToJsonElement(SharedFixtures.file(FIXTURE).readText()).jsonArray.map { element ->
            val case = element.jsonObject
            Vector(
                label = case.stringOrNull("_label") ?: error("$FIXTURE : un cas sans _label"),
                input = case["input"]?.jsonPrimitive?.content ?: error("$FIXTURE : un cas sans input"),
                expected = expectedTarget(case["expected"]),
            )
        }

    private fun expectedTarget(element: JsonElement?): ContentLinkTarget? {
        if (element == null || element is JsonNull) return null
        val expected = element.jsonObject
        return when (val kind = expected.stringOrNull("kind")) {
            "content" -> ContentLinkTarget.Content(
                postId = expected.stringOrNull("postId") ?: error("$FIXTURE : un contenu sans postId"),
                type = expected.stringOrNull("type")?.let(PostType::valueOf),
            )
            "tracked" -> ContentLinkTarget.Tracked(expected.stringOrNull("token") ?: error("$FIXTURE : un lien suivi sans jeton"))
            else -> error("$FIXTURE : issue inconnue « $kind »")
        }
    }

    @Test
    fun `the shared file is read, and an empty loop cannot pass`() {
        assertThat(vectors.size).isAtLeast(30)
    }

    @Test
    fun `the vectors cover a content, a tracked link and a refusal`() {
        assertThat(vectors.map { it.expected?.let { target -> target::class } }.toSet()).containsExactly(
            ContentLinkTarget.Content::class,
            ContentLinkTarget.Tracked::class,
            null,
        )
    }

    @Test
    fun `every shared vector reads the target the TypeScript law reads`() {
        vectors.forEach { vector ->
            assertWithMessage("${vector.label} : « ${vector.input} »").that(ContentLinkTarget.of(vector.input)).isEqualTo(vector.expected)
        }
    }

    private companion object {
        const val FIXTURE = "content-link/content-link.vectors.json"
    }
}
