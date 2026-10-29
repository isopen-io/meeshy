package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameBannerBadgeTest {

    private fun served(standing: String, treasury: String = "null") =
        GameIntegrationParser.userGame("""{"visible":true,"standing":$standing,"treasury":$treasury}""")

    private val base = """{"level":42,"tier":"eclat","prestige":2,"flame":"brasier","rank":"voix","division":2,"division5":4}"""

    @Test
    fun `le niveau, le palier, le rang et sa division sont ceux que le serveur sert`() {
        val badge = GameBannerBadge.of(served(base), "u1")!!

        assertThat(badge.level).isEqualTo(42)
        assertThat(badge.tier).isEqualTo(LevelTierKey.Eclat)
        assertThat(badge.rank).isEqualTo(GloryRank.Voix)
        assertThat(badge.division5).isEqualTo(4)
        assertThat(badge.prestige).isEqualTo(2)
    }

    @Test
    fun `les etincelles et la Gloire absentes ne se fabriquent pas, la Gloire nulle non plus`() {
        val badge = GameBannerBadge.of(served(base), "u1")!!
        assertThat(badge.pocket).isNull()
        assertThat(badge.glory).isNull()

        val zero = GameBannerBadge.of(served("""{"level":3,"tier":"lueur","prestige":0,"flame":null,"rank":"echo","division":1,"sparks":40,"glory":0}"""), "u1")!!
        assertThat(zero.pocket).isEqualTo(40)
        assertThat(zero.glory).isNull()
    }

    @Test
    fun `les points servis a un ancien client tiennent lieu de poche, les etincelles priment`() {
        val points = GameBannerBadge.of(served("""{"level":3,"tier":"lueur","prestige":0,"flame":null,"rank":"echo","division":1,"points":55}"""), "u1")!!
        val both = GameBannerBadge.of(served("""{"level":3,"tier":"lueur","prestige":0,"flame":null,"rank":"echo","division":1,"points":55,"sparks":70}"""), "u1")!!

        assertThat(points.pocket).isEqualTo(55)
        assertThat(both.pocket).isEqualTo(70)
    }

    @Test
    fun `le niveau ouvert par le rang prime et le record ne descend jamais sous le niveau montre`() {
        val badge = GameBannerBadge.of(
            served("""{"level":100,"tier":"galaxie","prestige":9,"flame":null,"rank":"legende","division":1,"ladder":{"level":620,"tier":"quasar","levelMaxLifetime":700},"levelMaxLifetime":10}"""),
            "u1",
        )!!

        assertThat(badge.level).isEqualTo(620)
        assertThat(badge.tier).isEqualTo(LevelTierKey.Quasar)
        assertThat(badge.levelMax).isEqualTo(620)
    }

    @Test
    fun `un refus, un compte inconnu ou le seul tresor ne dessinent rien`() {
        assertThat(GameBannerBadge.of(GameIntegrationParser.userGame("""{"visible":false,"standing":null,"treasury":null}"""), "u1")).isNull()
        assertThat(GameBannerBadge.of(served("null", treasury = """{"tier":"bourse"}"""), "u1")).isNull()
        assertThat(GameBannerBadge.of(null, "u1")).isNull()
        assertThat(GameBannerBadge.of(UserGameProfileResponse.HIDDEN, "u1")).isNull()
    }

    @Test
    fun `la Flamme n'est pas dans le type, le serveur ne la montre sur aucune fiche`() {
        assertThat(GameBannerBadge::class.java.declaredFields.map { it.name }).containsNoneOf("flame", "flameDays", "streak")
    }

    @Test
    fun `le cercle se remplit de la poche quand elle porte le niveau, sinon il reste plein`() {
        val carried = GameBannerBadge.of(served("""{"level":3,"tier":"lueur","prestige":0,"flame":null,"rank":"echo","division":1,"sparks":${GameLevels.threshold(3) + 1}}"""), "u1")!!
        val unrelated = GameBannerBadge.of(served("""{"level":3,"tier":"lueur","prestige":0,"flame":null,"rank":"echo","division":1,"sparks":1}"""), "u1")!!
        val none = GameBannerBadge.of(served("""{"level":3,"tier":"lueur","prestige":0,"flame":null,"rank":"echo","division":1}"""), "u1")!!

        assertThat(carried.levelProgress).isLessThan(1.0)
        assertThat(unrelated.levelProgress).isEqualTo(1.0)
        assertThat(none.levelProgress).isEqualTo(1.0)
    }

    @Test
    fun `le rang dit sa division en chiffres romains et le Mythe sa place`() {
        val ranked = GameBannerBadge.of(served(base), "u1")!!
        val mythic = GameBannerBadge.of(
            served("""{"level":100,"tier":"galaxie","prestige":5,"flame":null,"rank":"mythe","division":null,"mythic":{"number":7,"edition":9}}"""),
            "u1",
        )!!

        assertThat(ranked.rankLabel.args.map { (it as? GameTextArg.Verbatim)?.value }).contains("IV")
        assertThat(mythic.rankLabel).isEqualTo(GameCopyLaws.mythicSeat(7))
    }

    @Test
    fun `ce qui se peint est celui du membre demande, rien sous Jeu masque`() {
        val badge = GameBannerBadge.of(served(base), "u1")

        assertThat(GameBannerBadge.shown(badge, "u1", hidden = false)).isEqualTo(badge)
        assertThat(GameBannerBadge.shown(badge, "u2", hidden = false)).isNull()
        assertThat(GameBannerBadge.shown(badge, "u1", hidden = true)).isNull()
        assertThat(GameBannerBadge.shown(null, "u1", hidden = false)).isNull()
    }
}
