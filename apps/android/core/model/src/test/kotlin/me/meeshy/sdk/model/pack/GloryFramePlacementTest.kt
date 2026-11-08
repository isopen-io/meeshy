package me.meeshy.sdk.model.pack

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.game.FrameMomentFamily
import me.meeshy.sdk.model.game.FrameUsage
import me.meeshy.sdk.model.game.GloryFrameAppliesTo
import me.meeshy.sdk.model.game.GloryLaws
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.LevelTierKey
import me.meeshy.sdk.model.game.MeeshFrameEdition
import me.meeshy.sdk.model.game.TreasuryTierKey
import org.junit.Test

class GloryFramePlacementTest {

    private fun applies(json: String) = GloryFramePlacementReader.parseAppliesTo(Json.parseToJsonElement(json))

    private fun read(id: String, usage: FrameUsage, appliesTo: String, collection: String = "afrique", extra: String = "") =
        GloryFramePlacementReader.read(
            id, usage,
            Json.parseToJsonElement("""{"collection":"$collection","appliesTo":$appliesTo,"option":"V","motifs":["lion"],"hidden":false$extra}"""),
        )

    @Test
    fun `chaque famille de cible se lit et correspond a son usage`() {
        val cases = listOf(
            """{"family":"rank","rank":"ambassadeur","division":3}""" to FrameUsage.Rank(GloryRank.Ambassadeur, 3),
            """{"family":"rank","rank":"mythe","division":null}""" to FrameUsage.Rank(GloryRank.Mythe, null),
            """{"family":"tier","tier":"lueur"}""" to FrameUsage.Moment(FrameMomentFamily.Tier),
            """{"family":"meesh","edition":"gold"}""" to FrameUsage.Moment(FrameMomentFamily.Meesh),
            """{"family":"treasury","treasury":"coffre"}""" to FrameUsage.Moment(FrameMomentFamily.Treasury),
            """{"family":"flame","days":30}""" to FrameUsage.Moment(FrameMomentFamily.Flame),
            """{"family":"day"}""" to FrameUsage.Moment(FrameMomentFamily.Day),
            """{"family":"achievement","rarity":"epic"}""" to FrameUsage.Achievement(GloryLaws.AchievementRarity.Epic),
            """{"family":"achievement","rarity":null}""" to FrameUsage.Achievement(null),
        )
        cases.forEach { (json, usage) ->
            val target = applies(json)
            assertThat(target).isNotNull()
            assertThat(GloryFramePlacementReader.fits(target!!, usage)).isTrue()
        }
        assertThat(applies("""{"family":"tier","tier":"lueur"}""")).isEqualTo(GloryFrameAppliesTo.Tier(LevelTierKey.Lueur))
        assertThat(applies("""{"family":"meesh","edition":"gold"}""")).isEqualTo(GloryFrameAppliesTo.Meesh(MeeshFrameEdition.Gold))
        assertThat(applies("""{"family":"treasury","treasury":"coffre"}""")).isEqualTo(GloryFrameAppliesTo.Treasury(TreasuryTierKey.Coffre))
    }

    @Test
    fun `une cible illisible ne se lit pas`() {
        listOf(
            """{"family":"rank","rank":"mythe","division":2}""",
            """{"family":"rank","rank":"ambassadeur"}""",
            """{"family":"flame","days":8}""",
            """{"family":"achievement"}""",
            """{"family":"hologram"}""",
            """{"family":"meesh","edition":"platinum"}""",
        ).forEach { assertThat(applies(it)).isNull() }
    }

    @Test
    fun `une cible qui contredit l'usage ne correspond pas`() {
        val tier = GloryFrameAppliesTo.Tier(LevelTierKey.Lueur)
        assertThat(GloryFramePlacementReader.fits(tier, FrameUsage.Moment(FrameMomentFamily.Day))).isFalse()
        assertThat(GloryFramePlacementReader.fits(tier, FrameUsage.Prestige)).isFalse()
        assertThat(
            GloryFramePlacementReader.fits(GloryFrameAppliesTo.Achievement(GloryLaws.AchievementRarity.Rare), FrameUsage.Achievement(null)),
        ).isFalse()
    }

    @Test
    fun `un placement se lit quand il appartient a sa collection et ne contredit pas l'usage`() {
        val usage = FrameUsage.Rank(GloryRank.Ambassadeur, 3)
        val applies = """{"family":"rank","rank":"ambassadeur","division":3}"""
        val placement = read("afrique.amb3", usage, applies)
        assertThat(placement?.collection).isEqualTo("afrique")
        assertThat(placement?.option).isEqualTo("V")
        assertThat(placement?.motifs).containsExactly("lion")
        assertThat(read("autre.amb3", usage, applies)).isNull()
        assertThat(read("afrique.amb3", FrameUsage.Prestige, applies)).isNull()
        assertThat(read("afrique.amb3", usage, applies, extra = ""))
            .isEqualTo(read("afrique.amb3", usage, applies))
    }
}
