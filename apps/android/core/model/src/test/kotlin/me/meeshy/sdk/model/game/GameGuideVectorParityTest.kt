package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import me.meeshy.sdk.model.game.guide.GameGuide
import me.meeshy.sdk.model.game.guide.GameGuideV2
import me.meeshy.sdk.model.game.guide.GuideAnyEvent
import me.meeshy.sdk.model.game.guide.GuideAnyMoment
import me.meeshy.sdk.model.game.guide.GuideEvent
import me.meeshy.sdk.model.game.guide.GuideEventV2
import me.meeshy.sdk.model.game.guide.GuidePresentation
import me.meeshy.sdk.testutil.SharedFixtures
import org.junit.Test

/** Rejeu des lois `guide`, `guide-v2` et `guide-choose` de `game.vectors.json` (le TypeScript fait foi). */
class GameGuideVectorParityTest {

    private fun JsonElement?.int(): Int? = if (this == null || this is JsonNull) null else jsonPrimitive.intOrNull
    private fun JsonElement?.long(): Long = this!!.jsonPrimitive.longOrNull!!
    private fun JsonElement?.bool(): Boolean = this!!.jsonPrimitive.booleanOrNull!!
    private fun JsonElement?.text(): String = this!!.jsonPrimitive.content

    private fun lawCases(vararg laws: String) = SharedFixtures.vectors("reading-modes/game.vectors.json")
        .filter { it.input["law"]?.jsonPrimitive?.content in laws }
        .also { assertWithMessage("aucun vecteur $laws").that(it).isNotEmpty() }

    private fun <E : Enum<E>> Array<E>.byName(wire: String): E = first { it.name.lowercase() == wire }

    private fun original(e: JsonObject): GuideEvent? = when (e["kind"].text()) {
        "first-level" -> GuideEvent.FirstLevel(e["level"].int()!!, e["pointsToNext"].long())
        "new-tier" -> GuideEvent.NewTier(LevelTierKey.entries.toTypedArray().byName(e["tier"].text()), e["nextTierLevel"].int())
        "missions-unlocked" -> GuideEvent.MissionsUnlocked
        "first-mint-possible" ->
            GuideEvent.FirstMintPossible(e["price"].int()!!, e["levelsLost"].int()!!, e["gloryGain"].int()!!)
        "first-mint" -> GuideEvent.FirstMint
        "price-rises" -> GuideEvent.PriceRises(e["nextPrice"].int()!!)
        "new-rank" -> GuideEvent.NewRank(
            GloryRank.entries.toTypedArray().byName(e["rank"].text()),
            e["division"].int(), e["glory"].int()!!, e["gloryMissing"].int(),
        )
        "treasury-tier" ->
            GuideEvent.TreasuryTier(TreasuryTierKey.entries.toTypedArray().byName(e["tier"].text()), e["nextTierMissing"].int())
        "flame-at-risk" -> GuideEvent.FlameAtRisk(e["days"].int()!!)
        "flame-out" -> GuideEvent.FlameOut(e["lostDays"].int()!!, e["relightPrice"].int()!!, e["canRelight"].bool())
        "return-after-absence" -> GuideEvent.ReturnAfterAbsence(e["daysAway"].int()!!)
        "level-100" -> GuideEvent.Level100(e["canPrestige"].bool())
        else -> null
    }

    private fun league(e: JsonObject, key: String) = LeagueKey.entries.toTypedArray().byName(e[key].text())

    private fun wave2(e: JsonObject): GuideEventV2 = when (e["kind"].text()) {
        "league-first" -> GuideEventV2.LeagueFirst(league(e, "league"), e["pointsToPromotion"].int())
        "league-promoted" ->
            GuideEventV2.LeaguePromoted(league(e, "from"), league(e, "to"), e["rank"].int()!!, e["weekKey"].text())
        "league-relegated" ->
            GuideEventV2.LeagueRelegated(league(e, "from"), league(e, "to"), e["pointsToPromotion"].int(), e["weekKey"].text())
        "season-start" -> GuideEventV2.SeasonStart(e["season"].int()!!, e["themeKey"].text(), e["steps"].int()!!)
        "season-end" ->
            GuideEventV2.SeasonEnd(e["season"].int()!!, e["stepsReached"].int()!!, e["completed"].bool(), e["gloryGained"].int()!!)
        "trophy" -> GuideEventV2.Trophy(e["trophyKey"].text())
        "prestige" -> GuideEventV2.Prestige(e["prestige"].int()!!, e["gloryGained"].int()!!)
        "atlas-stamp" -> GuideEventV2.AtlasStamp(e["language"].text(), e["stamped"].int()!!, e["total"].int()!!)
        else -> error("événement inconnu ${e["kind"]}")
    }

    private fun any(e: JsonObject): GuideAnyEvent =
        original(e)?.let { GuideAnyEvent.Original(it) } ?: GuideAnyEvent.Wave2(wave2(e))

    private fun seen(input: JsonObject): Set<String> = input["seen"]!!.jsonArray.map { it.text() }.toSet()

    private fun presentation(p: GuidePresentation) = p.name.lowercase()

    @Test
    fun `guide rejoue le locuteur, l'humeur, le bouton et la presentation des douze moments`() {
        lawCases("guide").forEach { v ->
            val moment = GameGuide.moment(original(v.input["event"]!!.jsonObject)!!, seen(v.input))
            val e = v.expected as JsonObject
            assertWithMessage("${v.label} : key").that(moment.key.wire).isEqualTo(e["key"].text())
            assertWithMessage("${v.label} : speaker").that(moment.speaker.name.lowercase()).isEqualTo(e["speaker"].text())
            assertWithMessage("${v.label} : mood").that(moment.mood.name.lowercase()).isEqualTo(e["mood"].text())
            assertWithMessage("${v.label} : action").that(moment.action.wire).isEqualTo(e["action"].text())
            assertWithMessage("${v.label} : presentation").that(presentation(moment.presentation))
                .isEqualTo(e["presentation"].text())
        }
    }

    @Test
    fun `guide-v2 rejoue les huit moments de la vague 2`() {
        lawCases("guide-v2").forEach { v ->
            val moment = GameGuideV2.moment(wave2(v.input["event"]!!.jsonObject), seen(v.input))
            val e = v.expected as JsonObject
            assertWithMessage("${v.label} : key").that(moment.key.wire).isEqualTo(e["key"].text())
            assertWithMessage("${v.label} : speaker").that(moment.speaker.name.lowercase()).isEqualTo(e["speaker"].text())
            assertWithMessage("${v.label} : mood").that(moment.mood.name.lowercase()).isEqualTo(e["mood"].text())
            assertWithMessage("${v.label} : action").that(moment.action.wire).isEqualTo(e["action"].text())
            assertWithMessage("${v.label} : presentation").that(presentation(moment.presentation))
                .isEqualTo(e["presentation"].text())
        }
    }

    @Test
    fun `guide-choose rejoue le choix d'UNE carte parmi les vingt et un moments`() {
        lawCases("guide-choose").forEach { v ->
            val events = v.input["events"]!!.jsonArray.map { any(it.jsonObject) }
            val chosen = GameGuideV2.chooseMoment(events, seen(v.input))
            val e = v.expected as JsonObject
            val (key, pres) = when (chosen) {
                null -> null to null
                is GuideAnyMoment.Original -> chosen.moment.key.wire to presentation(chosen.moment.presentation)
                is GuideAnyMoment.Wave2 -> chosen.moment.key.wire to presentation(chosen.moment.presentation)
            }
            assertWithMessage("${v.label} : key").that(key).isEqualTo(e["key"]?.takeUnless { it is JsonNull }?.text())
            assertWithMessage("${v.label} : presentation").that(pres)
                .isEqualTo(e["presentation"]?.takeUnless { it is JsonNull }?.text())
        }
    }
}
