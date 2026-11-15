package me.meeshy.sdk.model.lens

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.testutil.SharedFixtures
import org.junit.Test

/** Rejeu Android de `packages/shared/fixtures/lens-v1/vectors.json` (le même fichier que vitest et Swift). */
class LensFormatVectorParityTest {

    private data class Summary(
        val status: String,
        val layerIds: List<String>? = null,
        val triggerCount: Int? = null,
        val ignoredLayers: Int? = null,
        val ignoredTriggers: Int? = null,
        val schema: Int? = null,
        val reasons: List<String>? = null,
    )

    private fun summary(outcome: LensParseOutcome): Summary = when (outcome) {
        is LensParseOutcome.Ok -> Summary(
            "ok", outcome.document.layers.map { it.id }, outcome.document.triggers.size,
            outcome.ignoredLayers, outcome.ignoredTriggers,
        )
        is LensParseOutcome.UpdateRequired -> Summary("update-required", schema = outcome.schema)
        is LensParseOutcome.Forbidden -> Summary("forbidden", reasons = outcome.reasons)
        LensParseOutcome.Invalid -> Summary("invalid")
    }

    private fun expected(expect: JsonObject): Summary = Summary(
        status = expect.getValue("status").jsonPrimitive.content,
        layerIds = (expect["layerIds"] as? JsonArray)?.map { it.jsonPrimitive.content },
        triggerCount = expect["triggerCount"]?.jsonPrimitive?.int,
        ignoredLayers = expect["ignoredLayers"]?.jsonPrimitive?.int,
        ignoredTriggers = expect["ignoredTriggers"]?.jsonPrimitive?.int,
        schema = expect["schema"]?.jsonPrimitive?.int,
        reasons = (expect["reasons"] as? JsonArray)?.map { it.jsonPrimitive.content },
    )

    private val vectors = SharedFixtures.root("lens-v1/vectors.json").getValue("vectors").jsonArray.map { it.jsonObject }

    @Test
    fun `chaque vecteur rend l'issue, les couches et les compteurs attendus`() {
        assertThat(vectors.size).isGreaterThan(40)
        val failures = vectors.mapNotNull { vector ->
            val actual = summary(LensFormat.parse(LensJsonValue.from(vector.getValue("input"))))
            val wanted = expected(vector.getValue("expect").jsonObject)
            if (actual == wanted) null else "« ${vector.getValue("name").jsonPrimitive.content} » : $actual au lieu de $wanted"
        }
        assertThat(failures).isEmpty()
    }

    @Test
    fun `les quatre issues du contrat sont couvertes par les vecteurs`() {
        val statuses = vectors.map { it.getValue("expect").jsonObject.getValue("status").jsonPrimitive.content }.toSet()
        assertThat(statuses).containsExactly("ok", "update-required", "forbidden", "invalid")
    }

    @Test
    fun `un texte qui n'est pas du JSON n'est pas une lens`() {
        assertThat(LensFormat.parse("pas du json")).isEqualTo(LensParseOutcome.Invalid)
    }

    @Test
    fun `un schema futur lu en texte demande la mise a jour`() {
        assertThat(LensFormat.parse("""{"schema":7}""")).isEqualTo(LensParseOutcome.UpdateRequired(7))
    }
}
