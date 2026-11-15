package me.meeshy.sdk.model.game.photo

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.model.game.LeagueKey
import me.meeshy.sdk.model.game.LevelTierKey
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.PhotoStepEmblem
import me.meeshy.sdk.model.game.TreasuryTierKey
import me.meeshy.sdk.model.game.guide.GuideEventV2
import me.meeshy.sdk.testutil.SharedFixtures
import me.meeshy.sdk.testutil.stringOrNull
import org.junit.Test

/** Un moment est une DONNÉE : identité stable, emblème, deux lignes (#9382, #9387, #10168, #10816). */
class GamePhotoMomentsTest {

    private fun JsonElement?.string(): String? = if (this == null || this is JsonNull) null else jsonPrimitive.contentOrNull
    private fun JsonElement?.int(): Int? = if (this == null || this is JsonNull) null else jsonPrimitive.intOrNull

    private fun league(wire: String?) = LeagueKey.entries.first { it.name.lowercase() == wire }

    private fun eventOf(e: JsonObject): GuideEventV2 = when (e["kind"].string()) {
        "league-first" -> GuideEventV2.LeagueFirst(league(e["league"].string()), e["pointsToPromotion"].int())
        "league-promoted" -> GuideEventV2.LeaguePromoted(league(e["from"].string()), league(e["to"].string()), e["rank"].int()!!, e["weekKey"].string()!!)
        "league-relegated" -> GuideEventV2.LeagueRelegated(league(e["from"].string()), league(e["to"].string()), e["pointsToPromotion"].int(), e["weekKey"].string()!!)
        "season-start" -> GuideEventV2.SeasonStart(e["season"].int()!!, e["themeKey"].string()!!, e["steps"].int()!!)
        "season-end" -> GuideEventV2.SeasonEnd(e["season"].int()!!, e["stepsReached"].int()!!, e["completed"]!!.jsonPrimitive.content.toBoolean(), e["gloryGained"].int()!!)
        "trophy" -> GuideEventV2.Trophy(e["trophyKey"].string()!!)
        "prestige" -> GuideEventV2.Prestige(e["prestige"].int()!!, e["gloryGained"].int()!!)
        "atlas-stamp" -> GuideEventV2.AtlasStamp(e["language"].string()!!, e["stamped"].int()!!, e["total"].int()!!)
        else -> error("événement ${e["kind"]}")
    }

    @Test
    fun `un moment par declencheur de la vague 2 avec l identite des vecteurs partages`() {
        val cases = SharedFixtures.vectors("reading-modes/game.vectors.json").filter { it.input.stringOrNull("law") == "photo-moment" }
        assertThat(cases).isNotEmpty()
        cases.forEach { v ->
            val expected = v.expected!!.jsonObject
            val event = v.input["event"]
            if (event != null) {
                assertWithMessage(v.label).that(GamePhotoMomentsV2.emblem(eventOf(event.jsonObject))?.id).isEqualTo(expected["id"].string())
            } else {
                val dayKey = v.input["dayKey"].string()!!
                assertWithMessage(v.label).that(GamePhotoMomentsV2.dayId(dayKey)).isEqualTo(expected["id"].string())
                assertWithMessage(v.label).that(me.meeshy.sdk.model.game.GamePhotoAlerts.dayOf("day:$dayKey")).isEqualTo(expected["day"].string())
            }
        }
    }

    @Test
    fun `une montee vers la meme ligue une autre semaine est un moment nouveau`() {
        val a = GamePhotoMomentsV2.emblem(GuideEventV2.LeaguePromoted(LeagueKey.Quartz, LeagueKey.Ambre, 3, "2026-10-12"))
        val b = GamePhotoMomentsV2.emblem(GuideEventV2.LeaguePromoted(LeagueKey.Quartz, LeagueKey.Ambre, 3, "2026-10-19"))
        assertThat(a!!.id).isNotEqualTo(b!!.id)
    }

    @Test
    fun `le haut fait et la mission portent une identite stable sans la rarete`() {
        assertThat(GamePhotoMomentsV2.achievementId("achievement.first_content")).isEqualTo("achievement:achievement.first_content")
        assertThat(GamePhotoMomentsV2.achievementId("achievement:achievement.first_content")).isEqualTo("achievement:achievement.first_content")
        assertThat(GamePhotoMomentsV2.missionId("m42")).isEqualTo("mission:m42")
    }

    @Test
    fun `chaque emblem des sept pistes dit deux lignes et un palier refait dit combien de fois`() {
        val tier = GamePhotoMoments.lines(PhotoStepEmblem.Tier(LevelTierKey.Lueur, 10, 1, 2))
        assertThat(tier.kicker.key).isEqualTo("game.photo.kicker.tier")
        assertThat(tier.title.times).isEqualTo(2)
        assertThat(GamePhotoMoments.lines(PhotoStepEmblem.Tier(LevelTierKey.Lueur, 10, 0, 1)).title.times).isNull()
        assertThat(GamePhotoMoments.lines(PhotoStepEmblem.Meesh(1, MeeshEdition.Silver)).title.key).isEqualTo("game.photo.title.meesh_first")
        assertThat(GamePhotoMoments.lines(PhotoStepEmblem.Meesh(100, MeeshEdition.Gold)).title.key).isEqualTo("game.photo.title.meesh_number_edition")
        assertThat(GamePhotoMoments.lines(PhotoStepEmblem.Treasury(TreasuryTierKey.Bourse)).title.key).isNull()
    }

    @Test
    fun `le trophee et la saison portent leurs lignes`() {
        assertThat(GamePhotoMomentsV2.lines(PhotoMomentEmblemV2.Season(2)).kicker.key).isEqualTo("game2.photo.kicker.season")
        assertThat(GamePhotoMomentsV2.lines(PhotoMomentEmblemV2.LeagueUp(LeagueKey.Ambre, "2026-10-12")).title.args)
            .containsExactly(PhotoLineArg.League(LeagueKey.Ambre))
    }
}
