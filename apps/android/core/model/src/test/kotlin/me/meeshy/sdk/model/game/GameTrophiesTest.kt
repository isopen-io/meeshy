package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.intOrNull
import me.meeshy.sdk.model.game.GameLawVectors.array
import me.meeshy.sdk.model.game.GameLawVectors.boolValue
import me.meeshy.sdk.model.game.GameLawVectors.obj
import me.meeshy.sdk.model.game.GameLawVectors.text
import org.junit.Test

class GameTrophiesTest {

    private fun records(c: GameLawVectors.Case) = c.input["owned"].array().map {
        TrophyRecord(it.obj()["key"].text(), it.obj()["awardedAt"].text())
    }

    private fun specOf(o: JsonObject): TrophySpec = when (o["kind"].text()) {
        "league-cup" -> TrophySpec.LeagueCupTrophy(
            period = o["weekKey"]?.let { LeagueCupPeriod.Week(it.text()) } ?: LeagueCupPeriod.Month(o["monthKey"].text()),
            league = LeagueKey.valueOf(o["league"].text().replaceFirstChar { it.uppercase() }),
            cup = LeagueCup.valueOf(o["cup"].text().replaceFirstChar { it.uppercase() }),
        )
        "season-cup" -> TrophySpec.SeasonCup(o["season"]!!.jsonPrimitive.intOrNull!!)
        "prestige" -> TrophySpec.Prestige(o["number"]!!.jsonPrimitive.intOrNull!!)
        else -> TrophySpec.Flame(o["days"]!!.jsonPrimitive.intOrNull!!)
    }

    @Test
    fun `les cles et leur lecture rejouent les vecteurs partages`() {
        GameLawVectors.cases("trophy-key").forEach {
            assertWithMessage(it.label).that(GameTrophies.key(specOf(it.input["spec"].obj()))).isEqualTo(it.expected["key"].text())
        }
        GameLawVectors.cases("trophy-parse").forEach {
            val expected = it.expected["spec"]
            val parsed = GameTrophies.parse(it.str("key"))
            if (expected == null || expected is JsonNull) assertWithMessage(it.label).that(parsed).isNull()
            else assertWithMessage(it.label).that(parsed).isEqualTo(specOf(expected.obj()))
        }
    }

    @Test
    fun `la Flamme gagne un trophee au franchissement du record`() {
        GameLawVectors.cases("trophy-flame").forEach {
            assertWithMessage(it.label)
                .that(GameTrophies.flameTrophiesEarned(it.input["previousLongest"]!!.jsonPrimitive.intOrNull!!, it.input["longest"]!!.jsonPrimitive.intOrNull!!))
                .isEqualTo(it.expected["days"].array().map { d -> d.jsonPrimitive.intOrNull })
        }
    }

    @Test
    fun `l'ordre de vitrine rejoue les vecteurs partages`() {
        GameLawVectors.cases("showcase-order").forEach {
            val order = it.input["order"].array().map { k -> k.text() }
            assertWithMessage(it.label).that(GameTrophies.orderShowcase(records(it), order))
                .isEqualTo(it.expected["order"].array().map { k -> k.text() })
        }
    }

    @Test
    fun `les visibilites rejouent les vecteurs partages`() {
        GameLawVectors.cases("showcase-view").forEach {
            val viewer = ShowcaseViewer.valueOf(it.str("viewer").replaceFirstChar { c -> c.uppercase() })
            assertWithMessage(it.label).that(GameTrophies.canView(it.str("visibility"), viewer)).isEqualTo(it.expected["visible"].boolValue())
        }
        GameLawVectors.cases("showcase-cap").forEach {
            val capped = GameTrophies.capVisibility(
                it.str("visibility"),
                it.input["hideProfileFromSearch"].boolValue(),
                it.input["gameHidden"].boolValue(),
            )
            assertWithMessage(it.label).that(capped.name.lowercase()).isEqualTo(it.expected["visibility"].text())
        }
    }

    @Test
    fun `le visiteur ne recoit que le mois et les coupes d'un meme mois se reunissent`() {
        GameLawVectors.cases("trophy-month").forEach {
            assertWithMessage(it.label).that(GameTrophies.visitorAwardedMonth(it.str("awardedAt"))).isEqualTo(it.expected["month"].text())
        }
        GameLawVectors.cases("trophy-visitor-key").forEach {
            assertWithMessage(it.label).that(GameTrophies.visitorKey(it.str("key"), it.str("awardedMonth"))).isEqualTo(it.expected["key"].text())
        }
        GameLawVectors.cases("showcase-visitor").forEach {
            val shown = GameTrophies.visitorShowcase(records(it), it.input["order"].array().map { k -> k.text() })
            val expected = it.expected["items"].array().map { i ->
                Triple(i.obj()["key"].text(), i.obj()["awardedMonth"].text(), i.obj()["count"]?.jsonPrimitive?.intOrNull)
            }
            assertWithMessage(it.label).that(shown.items.map { i -> Triple(i.key, i.awardedMonth, i.count) }).isEqualTo(expected)
            assertWithMessage(it.label).that(shown.order).isEqualTo(shown.items.map { i -> i.key })
        }
    }

    @Test
    fun `une vitrine illisible ou inconnue d'un visiteur ne montre aucun jour`() {
        assertThat(GameTrophies.visitorAwardedMonth("hier")).isNull()
        assertThat(GameTrophies.canView("secret-futur", ShowcaseViewer.Friend)).isFalse()
        assertThat(GameTrophies.canView("secret-futur", ShowcaseViewer.Admin)).isTrue()
        assertThat(GameTrophies.capVisibility("inconnue", false, false)).isEqualTo(ShowcaseVisibility.Me)
        assertThat(GameTrophies.atlasDefaultVisibility).isEqualTo(ShowcaseVisibility.Me)
    }
}
