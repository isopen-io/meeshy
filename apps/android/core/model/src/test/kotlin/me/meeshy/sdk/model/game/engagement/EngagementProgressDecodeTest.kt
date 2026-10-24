package me.meeshy.sdk.model.game.engagement

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.MintBlock
import org.junit.Test

class EngagementProgressDecodeTest {

    private val base = """"counters":[{"axisKey":"content.post","count":3},{"axisKey":"future.axis","count":8,"points":12}],
        "milestones":[{"milestoneType":"badge","milestoneKey":"content.post:1","reachedAt":"2026-09-01T08:00:00.000Z"}],
        "streak":{"currentStreakDays":2,"longestStreakDays":5},"level":{"engagementScore":40}"""

    @Test
    fun `un axe inconnu est une chaine jamais un echec`() {
        val p = EngagementProgressParser.parse("{$base}")!!

        assertThat(p.counters.map { it.axisKey }).containsExactly("content.post", "future.axis").inOrder()
        assertThat(EngagementProgressResolver.resolve(p).badgesEarned).isEqualTo(1)
    }

    @Test
    fun `une nature de palier inconnue refuse la charge entiere`() {
        val bad = base.replace("\"badge\"", "\"trophy\"")

        assertThat(EngagementProgressParser.parse("{$bad}")).isNull()
    }

    @Test
    fun `un serveur anterieur ne sert ni meesh ni elan ni jeu`() {
        val p = EngagementProgressParser.parse("{$base}")!!

        assertThat(p.meesh).isNull()
        assertThat(p.elan).isNull()
        assertThat(p.game).isNull()
        assertThat(p.gameRevision).isNull()
        assertThat(p.achievementReach).isNull()
        assertThat(p.level.sparks).isNull()
        assertThat(p.level.pocket).isEqualTo(40L)
    }

    @Test
    fun `les etincelles et la revision se lisent quand elles sont servies`() {
        val p = EngagementProgressParser.parse(
            """{$base,"gameRevision":1700000000123}""".replace(""""engagementScore":40""", """"engagementScore":40,"sparks":9007199254740991,"sparksDebt":3"""),
        )!!

        assertThat(p.level.sparks).isEqualTo(9007199254740991L)
        assertThat(p.level.pocket).isEqualTo(9007199254740991L)
        assertThat(p.level.sparksDebt).isEqualTo(3L)
        assertThat(p.gameRevision).isEqualTo(1700000000123L)
    }

    @Test
    fun `un bloc meesh illisible tombe seul sans emporter la progression`() {
        val p = EngagementProgressParser.parse("""{$base,"meesh":{"balance":"x"},"elan":{"factor":2.5,"activeFamilyCount":2,"hasStanding":true,"windowDays":7,"activeFamilies":["content"]}}""")!!

        assertThat(p.meesh).isNull()
        assertThat(p.elan!!.factor).isEqualTo(2.5)
    }

    @Test
    fun `le meesh complet se lit avec la dette et la carte d atteignabilite`() {
        val p = EngagementProgressParser.parse(
            """{$base,"meesh":{"balance":2,"mintedLifetime":3,"debitablePoints":900,"floorPoints":10,"missingPoints":100,"mintCost":1000,"blockedBy":"debt","firstMintedAt":"2026-09-01T08:00:00Z"},"achievementReach":{"conversation.join.size":100}}""",
        )!!

        assertThat(p.meesh!!.blockedBy).isEqualTo(MintBlock.Debt)
        assertThat(p.meesh!!.mintCost).isEqualTo(1000)
        assertThat(p.achievementReach).containsExactly("conversation.join.size", 100)
    }

    @Test
    fun `une charge incomplete ou non objet rend null`() {
        assertThat(EngagementProgressParser.parse("""{"counters":[]}""")).isNull()
        assertThat(EngagementProgressParser.parse("[]")).isNull()
        assertThat(EngagementProgressParser.parse("pas du json")).isNull()
        assertThat(EngagementProgressParser.parse(null as String?)).isNull()
    }
}
