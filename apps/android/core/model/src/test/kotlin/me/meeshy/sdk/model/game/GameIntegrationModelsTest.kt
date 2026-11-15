package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.game.GameBlockFixtures.json
import org.junit.Test

class GameIntegrationModelsTest {

    @Test
    fun `les reglages portent deux interrupteurs et quatre visibilites`() {
        val settings = GameIntegrationParser.settings(
            """{"gameHidden":true,"friendsLeagueOptOut":false,"visibility":{"showcase":"me","rank":"friends","treasury":"everyone","atlas":"me"}}""",
        )!!

        assertThat(settings.gameHidden).isTrue()
        assertThat(settings.friendsLeagueOptOut).isFalse()
        assertThat(settings.visibility)
            .isEqualTo(GameVisibility(ShowcaseVisibility.Me, ShowcaseVisibility.Friends, ShowcaseVisibility.Everyone, ShowcaseVisibility.Me))
        assertThat(GameIntegrationParser.settings("""{"success":true,"data":{"gameHidden":false,"friendsLeagueOptOut":false,"visibility":{"showcase":"me","rank":"me","treasury":"me","atlas":"me"}}}"""))
            .isNotNull()
        assertThat(GameIntegrationParser.settings("""{"gameHidden":true}""")).isNull()
    }

    @Test
    fun `le jeu d'un autre montre niveau palier etoiles forme de Flamme rang division et palier du tresor`() {
        val profile = GameIntegrationParser.userGame(
            """{"visible":true,"standing":{"level":42,"tier":"eclat","prestige":2,"flame":"brasier","rank":"voix","division":2},"treasury":{"tier":"coffre"}}""",
        )!!

        assertThat(profile.standing).isEqualTo(
            GameStanding(level = 42, tier = LevelTierKey.Eclat, prestige = 2, flame = FlameFormKey.Brasier, rank = GloryRank.Voix, division = 2),
        )
        assertThat(profile.treasury?.tier).isEqualTo(TreasuryTierKey.Coffre)
        assertThat(profile.hasSomethingToShow).isTrue()
    }

    @Test
    fun `le rang d'un autre lit division5 et la place du Mythe quand le serveur les sert`() {
        val ranked = GameIntegrationParser.userGame(
            """{"visible":true,"standing":{"level":42,"tier":"eclat","prestige":2,"flame":null,"rank":"voix","division":3,"division5":4},"treasury":null}""",
        )!!
        assertThat(ranked.standing?.shownDivision).isEqualTo(4)

        val mythic = GameIntegrationParser.userGame(
            """{"visible":true,"standing":{"level":100,"tier":"galaxie","prestige":5,"flame":null,"rank":"mythe","division":null,"mythic":{"number":7,"edition":9}},"treasury":null}""",
        )!!
        assertThat(mythic.standing?.mythic).isEqualTo(MythicSeatRef(7, 9))
        assertThat(mythic.standing?.shownDivision).isNull()
    }

    @Test
    fun `le niveau ouvert par le rang prime sur celui d'hier`() {
        val standing = GameIntegrationParser.userGame(
            """{"visible":true,"standing":{"level":100,"tier":"galaxie","prestige":9,"flame":null,"rank":"legende","division":1,"ladder":{"level":620,"tier":"quasar","levelMaxLifetime":700},"points":55,"levelMaxLifetime":700,"sparks":3,"sparksLifetime":9,"glory":12000},"treasury":null}""",
        )!!.standing!!

        assertThat(standing.shownLevel).isEqualTo(620)
        assertThat(standing.shownTier).isEqualTo(LevelTierKey.Quasar)
        assertThat(standing.prestige).isEqualTo(5)
        assertThat(standing.points).isEqualTo(55)
        assertThat(standing.glory).isEqualTo(12000)
    }

    @Test
    fun `un refus rend exactement visible false et deux blocs nuls et ne dessine rien`() {
        val refused = GameIntegrationParser.userGame("""{"visible":false,"standing":null,"treasury":null}""")!!

        assertThat(refused).isEqualTo(UserGameProfileResponse.HIDDEN)
        assertThat(refused.hasSomethingToShow).isFalse()
        assertThat(UserGameProfileResponse(visible = true).hasSomethingToShow).isFalse()
        assertThat(UserGameProfileResponse(visible = false, treasury = GameShownTreasury(TreasuryTierKey.Bourse)).hasSomethingToShow).isFalse()
    }

    @Test
    fun `un palier inconnu fait tomber le niveau SEUL le tresor reste lu`() {
        val profile = GameIntegrationParser.userGame(
            """{"visible":true,"standing":{"level":42,"tier":"hypernova","prestige":0,"flame":null,"rank":"voix","division":3},"treasury":{"tier":"bourse"}}""",
        )!!

        assertThat(profile.standing).isNull()
        assertThat(profile.treasury?.tier).isEqualTo(TreasuryTierKey.Bourse)
        assertThat(profile.hasSomethingToShow).isTrue()
    }

    @Test
    fun `une forme de Flamme inconnue tombe seule et un palier de tresor inconnu ne montre rien`() {
        val profile = GameIntegrationParser.userGame(
            """{"visible":true,"standing":{"level":7,"tier":"lueur","prestige":0,"flame":"pulsar","rank":"echo","division":1},"treasury":{"tier":"abysse"}}""",
        )!!

        assertThat(profile.standing?.flame).isNull()
        assertThat(profile.standing?.rank).isEqualTo(GloryRank.Echo)
        assertThat(profile.treasury?.tier).isNull()
    }

    @Test
    fun `le jeu d'un autre ne sert jamais jours de serie Meesh date ni presence`() {
        val keys = standingKeys()

        assertThat(keys.filter { it.contains("day", true) || it.contains("streak", true) }).isEmpty()
        assertThat(keys.filter { it.contains("meesh", true) || it.contains("online", true) || it.contains("active", true) }).isEmpty()
        assertThat(keys.filter { it.contains("At") || it.contains("date", true) || it.contains("presence", true) }).isEmpty()
        assertThat(json.encodeToString(GameShownTreasury(TreasuryTierKey.Coffre))).isEqualTo("""{"tier":"coffre"}""")
    }

    private fun standingKeys(): Set<String> {
        val standing = GameStanding(level = 1, tier = LevelTierKey.Etincelle, prestige = 0, rank = GloryRank.Murmure)
        return (json.parseToJsonElement(json.encodeToString(standing)) as JsonObject).keys
    }
}
