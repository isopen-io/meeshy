package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.testutil.SharedFixtures
import me.meeshy.sdk.testutil.stringOrNull
import org.junit.Test

/**
 * Rejeu de `game.vectors.json` (TS fait foi) contre la loi du rattrapage de la Chronique : `photo-catch-up` (étapes
 * franchies et entrées ouvertes ou verrouillées), `photo-offer` (la proposition d'une transition) et `photo-standing`
 * (la situation lue dans le bloc servi). Miroir de `GameLawVectorEvaluatorPhoto` iOS.
 */
class GamePhotoCatchUpVectorParityTest {

    private val cases = SharedFixtures.vectors("reading-modes/game.vectors.json")

    private fun cases(law: String) = cases.filter { it.input.stringOrNull("law") == law }
        .also { assertWithMessage("aucun vecteur $law").that(it).isNotEmpty() }

    private fun JsonElement?.int(): Int? = if (this == null || this is JsonNull) null else jsonPrimitive.intOrNull
    private fun JsonElement?.string(): String? = if (this == null || this is JsonNull) null else jsonPrimitive.contentOrNull

    private fun standingOf(obj: JsonObject) = PhotoCatchUpStanding(
        rank = GloryRank.entries.first { it.name.lowercase() == obj["rank"].string() },
        division = obj["division"].int(),
        levelRecord = obj["levelRecord"].int()!!,
        prestige = obj["prestige"].int()!!,
        minted = obj["minted"].int()!!,
        treasuryTier = obj["treasuryTier"].string()?.let { wire -> TreasuryTierKey.entries.first { it.name.lowercase() == wire } },
        flameRecord = obj["flameRecord"].int()!!,
        pastCycleRecords = (obj["pastCycleRecords"] as? kotlinx.serialization.json.JsonArray)?.map { it.int()!! },
    )

    private fun kept(input: JsonObject): Set<String> = input["kept"]!!.jsonArray.map { it.string()!! }.toSet()

    private fun emblemWire(emblem: PhotoStepEmblem): Map<String, Any?> = when (emblem) {
        PhotoStepEmblem.Start -> mapOf("kind" to "start")
        is PhotoStepEmblem.Rank -> mapOf("kind" to "rank", "rank" to emblem.rank.name.lowercase(), "division" to emblem.division)
        is PhotoStepEmblem.Tier -> mapOf(
            "kind" to "tier", "tier" to emblem.tier.name.lowercase(), "level" to emblem.level,
            "prestige" to emblem.prestige, "times" to emblem.times,
        )
        PhotoStepEmblem.LevelHundred -> mapOf("kind" to "level-hundred", "prestige" to 0)
        is PhotoStepEmblem.Prestige -> mapOf("kind" to "prestige", "number" to emblem.number)
        is PhotoStepEmblem.Meesh -> mapOf("kind" to "meesh", "number" to emblem.number, "edition" to emblem.edition.name.lowercase())
        is PhotoStepEmblem.Treasury -> mapOf("kind" to "treasury", "tier" to emblem.tier.name.lowercase())
        is PhotoStepEmblem.Flame -> mapOf("kind" to "flame", "form" to emblem.form.name.lowercase(), "days" to emblem.days)
    }

    private fun expectedEmblem(obj: JsonObject): Map<String, Any?> = obj.mapValues { (_, value) ->
        value.int() ?: value.string()
    }

    @Test
    fun `photo-catch-up rejoue les etapes franchies et le rattrapage`() {
        cases("photo-catch-up").forEach { v ->
            val e = v.expected!!.jsonObject
            val standing = standingOf(v.input["standing"]!!.jsonObject)
            val steps = GamePhotoCatchUpLaw.stepsReached(standing)
            val expectedSteps = e["steps"]!!.jsonArray.map { it.jsonObject }
            assertWithMessage("${v.label} : étapes").that(steps.map { it.id }).containsExactlyElementsIn(expectedSteps.map { it["id"].string() }).inOrder()
            steps.zip(expectedSteps).forEach { (step, expected) ->
                assertWithMessage("${v.label} : piste de ${step.id}").that(step.track.wire).isEqualTo(expected["track"].string())
                assertWithMessage("${v.label} : emblème de ${step.id}").that(emblemWire(step.emblem)).isEqualTo(expectedEmblem(expected["emblem"]!!.jsonObject))
            }
            val entries = GamePhotoCatchUpLaw.catchUp(standing, kept(v.input))
            val expectedEntries = e["entries"]!!.jsonArray.map { it.jsonObject }
            assertWithMessage("${v.label} : entrées").that(entries.map { it.id }).containsExactlyElementsIn(expectedEntries.map { it["id"].string() }).inOrder()
            entries.zip(expectedEntries).forEach { (entry, expected) ->
                assertWithMessage("${v.label} : état de ${entry.id}").that(if (entry.isOpen) "open" else "locked").isEqualTo(expected["state"].string())
                assertWithMessage("${v.label} : attente de ${entry.id}").that(entry.blockedBy).isEqualTo(expected["blockedBy"].string())
                assertWithMessage("${v.label} : piste de ${entry.id}").that(entry.track.wire).isEqualTo(expected["track"].string())
            }
        }
    }

    @Test
    fun `photo-offer rejoue la proposition d une transition`() {
        cases("photo-offer").forEach { v ->
            val e = v.expected!!.jsonObject
            val ids = v.input["momentIds"]!!.jsonArray.map { it.string()!! }
            val standing = standingOf(v.input["standing"]!!.jsonObject)
            assertWithMessage("${v.label} : proposition")
                .that(GamePhotoCatchUpLaw.offer(ids, standing, kept(v.input)))
                .isEqualTo(e["offer"].string())
            assertWithMessage("${v.label} : pistes")
                .that(ids.map { GamePhotoCatchUpLaw.track(it)?.wire })
                .isEqualTo(e["tracks"]!!.jsonArray.map { it.string() })
        }
    }

    @Test
    fun `photo-standing lit la situation dans le bloc servi`() {
        cases("photo-standing").forEach { v ->
            val served = v.input["game"]!!.jsonObject
            val game = checkNotNull(GameBlockParser.parse(GameBlockFixtures.block(overrides = served))) { "${v.label} : bloc illisible" }
            val actual = PhotoCatchUpStanding.of(game)
            assertWithMessage("${v.label} : situation").that(actual).isEqualTo(standingOf(v.expected!!.jsonObject))
        }
    }
}
