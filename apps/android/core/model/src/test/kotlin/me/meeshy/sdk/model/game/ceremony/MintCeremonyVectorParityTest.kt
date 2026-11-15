package me.meeshy.sdk.model.game.ceremony

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.model.game.MeeshEdition
import org.junit.Test

/**
 * Rejeu Android des vecteurs partagés de la CÉRÉMONIE DE LA FRAPPE (`packages/shared/fixtures/reading-modes/
 * mint-ceremony.vectors.json`) : les instants de chaque phase, les coups et leurs frappeurs, les particules, le refus
 * et le fondu. Le TypeScript fait foi (`utils/game/mint-ceremony.ts`), iOS rejoue le même fichier : le déroulé ne
 * peut pas diverger d'une plateforme à l'autre.
 */
class MintCeremonyVectorParityTest {

    private fun fixture(): File {
        val relative = "packages/shared/fixtures/reading-modes/mint-ceremony.vectors.json"
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, relative)
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        error("mint-ceremony.vectors.json introuvable en remontant depuis ${File("").absolutePath}")
    }

    private fun vectors(): List<JsonObject> =
        Json.parseToJsonElement(fixture().readText()).jsonObject.getValue("vectors").jsonArray.map { it.jsonObject }

    private fun edition(input: JsonObject): MeeshEdition = when (input.getValue("edition").jsonPrimitive.content) {
        "gold" -> MeeshEdition.Gold
        "prism" -> MeeshEdition.Prism
        else -> MeeshEdition.Silver
    }

    private fun mode(input: JsonObject): MintCeremonyMode = when (input.getValue("mode").jsonPrimitive.content) {
        "refused" -> MintCeremonyMode.Refused
        "reduced" -> MintCeremonyMode.Reduced
        else -> MintCeremonyMode.Normal
    }

    private fun planOf(input: JsonObject): MintCeremonyPlan = GameMintCeremony.plan(
        edition = edition(input),
        mode = mode(input),
        answeredAtMs = input["answeredAtMs"]?.jsonPrimitive?.doubleOrNull,
        modest = input["modest"]?.jsonPrimitive?.booleanOrNull == true,
    )

    private fun evaluate(input: JsonObject): JsonElement = when (input.getValue("law").jsonPrimitive.content) {
        "mint-ceremony-plan" -> encode(planOf(input))
        "mint-ceremony-skip" -> JsonObject(
            mapOf("toMs" to JsonPrimitive(GameMintCeremony.skip(planOf(input), input.getValue("atMs").jsonPrimitive.content.toDouble()))),
        )
        "mint-refusal-reason" -> JsonObject(
            mapOf("reason" to JsonPrimitive(GameMintCeremony.refusalReason((input["code"] as? JsonPrimitive)?.contentOrNull).wire)),
        )
        else -> error("loi inconnue")
    }

    @Test
    fun every_shared_vector_is_replayed_number_for_number() {
        val all = vectors()
        assertThat(all.size).isAtLeast(24)
        all.forEach { vector ->
            val label = vector["_label"]?.jsonPrimitive?.content
            assertWithMessage(label).that(evaluate(vector.getValue("input").jsonObject)).isEqualTo(vector.getValue("expected"))
        }
    }

    private fun span(span: MintCeremonySpan?): JsonElement =
        span?.let { JsonObject(mapOf("fromMs" to JsonPrimitive(it.fromMs), "toMs" to JsonPrimitive(it.toMs))) } ?: JsonNull

    private fun encode(plan: MintCeremonyPlan): JsonObject = JsonObject(
        mapOf(
            "edition" to JsonPrimitive(plan.edition.name.lowercase()),
            "mode" to JsonPrimitive(plan.mode.name.lowercase()),
            "grand" to JsonPrimitive(plan.grand),
            "particles" to JsonObject(
                mapOf(
                    "weave" to JsonPrimitive(plan.particles.weave),
                    "dust" to JsonArray(
                        plan.particles.dust.map {
                            JsonObject(
                                mapOf(
                                    "from" to JsonPrimitive(it.from.wire),
                                    "material" to JsonPrimitive(it.material.wire),
                                    "count" to JsonPrimitive(it.count),
                                ),
                            )
                        },
                    ),
                    "bursts" to JsonArray(plan.particles.bursts.map(::JsonPrimitive)),
                    "puff" to JsonPrimitive(plan.particles.puff),
                ),
            ),
            "phases" to JsonObject(MintCeremonyPhase.entries.associate { it.wire to span(plan.span(it)) }),
            "strikes" to JsonArray(
                plan.strikes.map {
                    JsonObject(
                        mapOf(
                            "atMs" to JsonPrimitive(it.atMs),
                            "impactMs" to JsonPrimitive(it.impactMs),
                            "hitters" to JsonArray(it.hitters.map { hitter -> JsonPrimitive(hitter.wire) }),
                            "final" to JsonPrimitive(it.isFinal),
                        ),
                    )
                },
            ),
            "refusal" to (
                plan.refusal?.let {
                    JsonObject(
                        mapOf(
                            "atMs" to JsonPrimitive(it.atMs),
                            "rewind" to span(it.rewind),
                            "rewindToMs" to JsonPrimitive(it.rewindToMs),
                            "shadowIn" to span(it.shadowIn),
                            "shadowOut" to span(it.shadowOut),
                            "sayMs" to JsonPrimitive(it.sayMs),
                        ),
                    )
                } ?: JsonNull
                ),
            "endMs" to JsonPrimitive(plan.endMs),
        ),
    )
}
