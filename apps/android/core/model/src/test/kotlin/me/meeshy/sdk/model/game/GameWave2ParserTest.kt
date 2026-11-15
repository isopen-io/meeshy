package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import me.meeshy.sdk.model.game.GameBlockFixtures.json
import org.junit.Test

class GameWave2ParserTest {

    /** Les extensions telles que le producteur serveur les PRODUIT (ligue jade, duo actif, saison 1…). */
    private val extras = """
    {"league":{"unlocked":true,"access":"open","pseudonym":"Zephyr","weekKey":"2026-10-12","closes":{"dayKey":"2026-10-18","minuteOfDay":1200},"current":{"league":"jade","groupId":"2026-10-12:jade:1","groupSize":12,"rank":4,"weekPoints":410,"zone":"promotion","cup":null,"pointsToPromotion":0},"friends":{"rank":2,"size":3,"weekPoints":410}},"duo":{"unlocked":true,"status":"active","duoId":"65a1b2c3d4e5f60718293a4b","weekKey":"2026-10-12","role":"inviter","partner":{"userId":"f1","displayName":"Ana"},"mission":{"templateKey":"duo-messages","signal":"axis:content.text_message","prism":false,"partTarget":52,"commonTarget":104},"progress":{"mine":30,"partner":52,"common":82,"commonTarget":104,"mineDone":false,"partnerDone":true,"bothDone":false},"reward":{"points":0,"doubled":false}},"season":{"number":1,"themeKey":"language:fr","startDay":"2026-10-12","endDay":"2026-12-06","week":1,"stars":18,"steps":4,"stepsTotal":40,"starsToNext":2,"progress":0.5,"completed":false,"claimedSteps":[1,2],"nextReward":{"step":3,"reward":{"kind":"points","amount":100}},"sealOwned":false,"sealPrice":10},"trophies":{"items":[{"key":"trophy.league-cup.2026-10-05.jade.gold","awardedAt":"2026-10-12T00:05:00.000Z"},{"key":"trophy.flame.100","awardedAt":"2026-10-01T10:00:00.000Z"}],"order":["trophy.flame.100","trophy.league-cup.2026-10-05.jade.gold"]},"atlas":{"stamped":1,"total":83,"stamps":[{"language":"ja","stampedOn":"2026-10-13"}],"pending":[{"language":"sw","sent":true,"received":false}]},"prestige":{"stars":0,"max":5,"canPrestige":false,"gloryOnPass":1000},"visibility":{"showcase":"friends","rank":"friends","treasury":"me","atlas":"me"}}
    """.trimIndent()

    private fun extras(patch: (MutableMap<String, JsonElement>) -> Unit = {}): Map<String, JsonElement> =
        (Json.parseToJsonElement(extras) as JsonObject).toMutableMap().also(patch)

    private fun parse(patch: (MutableMap<String, JsonElement>) -> Unit = {}): GameBlock? {
        val base = GameBlockFixtures.block()
        return GameBlockParser.parse(JsonObject(base + extras(patch)))
    }

    @Test
    fun `les extensions que la passerelle sert se decodent en entier`() {
        val block = parse()!!

        val league = block.league!!
        assertThat(league.access).isEqualTo(LeagueAccess.Open)
        assertThat(league.pseudonym).isEqualTo("Zephyr")
        assertThat(league.current?.league).isEqualTo(LeagueKey.Jade)
        assertThat(league.current?.zone).isEqualTo(LeagueZone.Promotion)
        assertThat(league.current?.cup).isNull()
        assertThat(league.current?.pointsToPromotion).isEqualTo(0)
        assertThat(league.friends).isEqualTo(LeagueFriends(rank = 2, size = 3, weekPoints = 410))
        assertThat(league.closes).isEqualTo(LeagueCloses("2026-10-18", 1200))

        val duo = block.duo!!
        assertThat(duo.status).isEqualTo(DuoBlockStatus.Active)
        assertThat(duo.role).isEqualTo(DuoActor.Inviter)
        assertThat(duo.partner?.displayName).isEqualTo("Ana")
        assertThat(duo.mission?.partTarget).isEqualTo(52)
        assertThat(duo.progress?.partnerDone).isTrue()
        assertThat(duo.reward).isEqualTo(DuoReward(points = 0, doubled = false))

        val season = block.season!!
        assertThat(season.number).isEqualTo(1)
        assertThat(season.claimedSteps).containsExactly(1, 2).inOrder()
        assertThat(season.nextReward).isEqualTo(SeasonNextReward(3, SeasonRewardBlock(SeasonRewardKind.Points, 100)))

        assertThat(block.trophies?.items).hasSize(2)
        assertThat(block.trophies?.order?.first()).isEqualTo("trophy.flame.100")
        assertThat(block.atlas?.stamps).containsExactly(AtlasStamp("ja", "2026-10-13"))
        assertThat(block.prestige).isEqualTo(GamePrestigeBlock(0, 5, false, 1000))
        assertThat(block.visibility)
            .isEqualTo(GameVisibility(ShowcaseVisibility.Friends, ShowcaseVisibility.Friends, ShowcaseVisibility.Me, ShowcaseVisibility.Me))
    }

    @Test
    fun `un serveur anterieur ne sert aucune extension le bloc reste lisible et les extensions sont nulles`() {
        val block = GameBlockParser.parse(GameBlockFixtures.block())!!

        assertThat(block.wave2).isEqualTo(GameWave2.EMPTY)
        assertThat(block.league).isNull()
        assertThat(block.duo).isNull()
        assertThat(block.season).isNull()
        assertThat(block.trophies).isNull()
        assertThat(block.atlas).isNull()
        assertThat(block.prestige).isNull()
        assertThat(block.visibility).isNull()
        assertThat(block.wave2.seasonServed).isFalse()
    }

    @Test
    fun `une extension illisible tombe SEULE et le niveau la Flamme et les autres extensions restent`() {
        val block = parse {
            it["league"] = buildJsonObject { put("unlocked", true); put("access", "ouverte-dans-le-futur") }
        }!!

        assertThat(block.league).isNull()
        assertThat(block.level.shown.level).isEqualTo(142)
        assertThat(block.duo).isNotNull()
        assertThat(block.season).isNotNull()
        assertThat(block.trophies).isNotNull()
        assertThat(block.atlas).isNotNull()
        assertThat(block.prestige).isNotNull()
    }

    @Test
    fun `chaque extension tombe seule quand elle est illisible`() {
        listOf("league", "duo", "season", "trophies", "atlas", "prestige", "visibility").forEach { key ->
            val block = parse { it[key] = buildJsonObject { put("inconnu", 1) } }!!
            val read = mapOf(
                "league" to block.league, "duo" to block.duo, "season" to block.season, "trophies" to block.trophies,
                "atlas" to block.atlas, "prestige" to block.prestige, "visibility" to block.visibility,
            )
            assertThat(read.getValue(key)).isNull()
            assertThat(read.filterKeys { it != key }.values.all { it != null }).isTrue()
        }
    }

    @Test
    fun `une cle de ligue inconnue ne fait tomber que la ligue`() {
        val patched = extras().toMutableMap()
        val raw = Json.parseToJsonElement(extras.replace("\"league\":\"jade\"", "\"league\":\"mythril\"")) as JsonObject
        patched.putAll(raw)

        val block = GameBlockParser.parse(JsonObject(GameBlockFixtures.block() + patched))!!

        assertThat(block.league).isNull()
        assertThat(block.trophies).isNotNull()
    }

    @Test
    fun `la saison est lue comme servie des qu'une autre extension l'est meme nulle`() {
        val block = parse { it["season"] = JsonNull }!!

        assertThat(block.season).isNull()
        assertThat(block.league).isNotNull()
        assertThat(block.wave2.seasonServed).isTrue()
    }

    @Test
    fun `la saison a venir se lit et une saison a venir illisible tombe seule`() {
        val upcoming = buildJsonObject {
            put("number", 1); put("themeKey", "language:fr"); put("startDay", "2026-12-21"); put("endDay", "2027-02-14")
        }
        val block = parse { it["season"] = JsonNull; it["seasonUpcoming"] = upcoming }!!
        assertThat(block.season).isNull()
        assertThat(block.seasonUpcoming).isEqualTo(GameUpcomingSeasonBlock(1, "language:fr", "2026-12-21", "2027-02-14"))

        val garbled = parse { it["seasonUpcoming"] = buildJsonObject { put("number", "un") } }!!
        assertThat(garbled.seasonUpcoming).isNull()
        assertThat(garbled.season).isNotNull()
        assertThat(parse()!!.seasonUpcoming).isNull()
    }

    @Test
    fun `les points d'une etape suivent la saison servie sinon la loi`() {
        val season = parse()!!.season!!
        assertThat(season.servedStepPoints).isEqualTo(100)
        assertThat(season.copy(stepPoints = 150).servedStepPoints).isEqualTo(150)
        assertThat(season.copy(stepPoints = 0).servedStepPoints).isEqualTo(100)
    }

    @Test
    fun `la rarete mesuree se lit entree par entree et rien ne se montre sous les seuils`() {
        val rarities = Json.parseToJsonElement(
            """{"achievement.first_content":{"rarity":"epic","holders":4000,"population":100000},
            "achievement.editor":{"rarity":"mythic","holders":2,"population":100000},
            "achievement.first_voice":{"rarity":"inconnue","holders":9,"population":100},
            "achievement.three":{"rarity":null,"holders":1,"population":500}}""",
        )
        val map = parse { it["achievementRarities"] = rarities }!!.achievementRarities!!

        assertThat(map.keys).containsExactly("achievement.first_content", "achievement.editor")
        assertThat(map.getValue("achievement.first_content").visibleRarity).isEqualTo(AchievementRarity.Epic)
        assertThat(map.getValue("achievement.editor").rarity).isEqualTo(AchievementRarity.Mythic)
        assertThat(map.getValue("achievement.editor").visibleRarity).isNull()
        assertThat(map.getValue("achievement.first_content").sharePercent).isWithin(1e-9).of(4.0)
        assertThat(parse()!!.achievementRarities).isNull()
    }

    @Test
    fun `une carte de raretes sans entree lisible vaut nulle`() {
        val block = parse { it["achievementRarities"] = Json.parseToJsonElement("""{"a":{"rarity":"x"}}""") }!!
        assertThat(block.achievementRarities).isNull()
    }

    @Test
    fun `le bloc et ses extensions survivent a un aller-retour par le cache`() {
        val block = parse()!!

        val again = GameBlockParser.parse(json.encodeToString(block))!!

        assertThat(again).isEqualTo(block)
        assertThat(again.league?.pseudonym).isEqualTo("Zephyr")
    }

    @Test
    fun `les ligues se classent du Quartz au Prisme`() {
        assertThat(LeagueKey.Quartz.previous).isNull()
        assertThat(LeagueKey.Quartz.next).isEqualTo(LeagueKey.Ambre)
        assertThat(LeagueKey.Prisme.next).isNull()
        assertThat(LeagueKey.Prisme.index).isEqualTo(7)
        assertThat(LeagueKey.Jade.previous).isEqualTo(LeagueKey.Ambre)
    }

    @Test
    fun `l'ecriture du consentement n'envoie un pseudonyme que s'il est choisi`() {
        assertThat(json.encodeToString(LeagueConsentRequest("req-12345678", true)))
            .isEqualTo("""{"requestId":"req-12345678","consent":true}""")
        assertThat(json.encodeToString(LeagueConsentRequest("req-12345678", true, "Zephyr")))
            .isEqualTo("""{"requestId":"req-12345678","consent":true,"pseudonym":"Zephyr"}""")
    }

    @Test
    fun `la visibilite n'envoie que les reglages qu'on change et la confidentialite aussi`() {
        assertThat(json.encodeToString(ShowcaseVisibilityRequest("req-12345678", atlas = ShowcaseVisibility.Friends)))
            .isEqualTo("""{"requestId":"req-12345678","atlas":"friends"}""")
        assertThat(json.encodeToString(GamePrivacyRequest("req-12345678", gameHidden = true)))
            .isEqualTo("""{"requestId":"req-12345678","gameHidden":true}""")
        assertThat(json.encodeToString(DuoInviteRequest("req-12345678", "f1")))
            .isEqualTo("""{"requestId":"req-12345678","friendId":"f1"}""")
        assertThat(json.encodeToString(ShowcaseOrderRequest("req-12345678", listOf("a"))))
            .isEqualTo("""{"requestId":"req-12345678","order":["a"]}""")
    }

    @Test
    fun `un statut d'ecriture inconnu ne fait pas echouer une ecriture deja faite`() {
        val claim = GameWave2Parser.seasonClaim(
            """{"success":true,"data":{"status":"already-claimed","step":5,"reward":{"kind":"fragment","amount":1},"seal":null,"completed":false,"gloryGained":0,"score":120}}""",
        )!!
        assertThat(claim.alreadyDone).isTrue()
        assertThat(claim.reward.kind).isEqualTo(SeasonRewardKind.Fragment)
        assertThat(claim.seal).isNull()

        val invite = GameWave2Parser.duoInvite("""{"status":"nouveau-statut","duoId":"d1","weekKey":"2026-10-12"}""")!!
        assertThat(invite.alreadyDone).isFalse()
        assertThat(GameWave2Parser.duoStatus("""{"status":"already-abandoned","duoId":"d1"}""")!!.alreadyDone).isTrue()
        assertThat(GameWave2Parser.seasonSeal("""{"status":"bought","balance":4}""")!!.balance).isEqualTo(4)
    }

    @Test
    fun `les reponses de la ligue se lisent et une charge illisible rend null`() {
        val week = GameWave2Parser.leagueWeek(
            """{"weekKey":"2026-10-12","snapshotDay":"2026-10-14","closes":{"dayKey":"2026-10-18","minuteOfDay":1200},"placed":true,"league":"jade","groupId":"g",
            "entries":[{"rank":1,"displayName":"Zephyr","weekPoints":410,"zone":"promotion","cup":null,"isMe":true}]}""",
        )!!
        assertThat(week.entries.single().isMe).isTrue()
        assertThat(week.league).isEqualTo(LeagueKey.Jade)

        val friends = GameWave2Parser.leagueFriends(
            """{"weekKey":"2026-10-12","closes":{"dayKey":"2026-10-18","minuteOfDay":1200},"entries":[{"rank":1,"userId":"f1","weekPoints":3,"isMe":false}]}""",
        )!!
        assertThat(friends.entries.single().userId).isEqualTo("f1")
        assertThat(GameWave2Parser.leagueWeek("pas du json")).isNull()
        assertThat(GameWave2Parser.leagueWeek("""{"weekKey":"x"}""")).isNull()
        assertThat(GameWave2Parser.leagueWeek(null)).isNull()
    }

    @Test
    fun `la vitrine d'un visiteur porte un mois et un compte jamais une date`() {
        val showcase = GameWave2Parser.userShowcase(
            """{"visible":true,"items":[{"key":"trophy.league-cup.2026-10.jade.gold","awardedMonth":"2026-10","count":2},{"key":"trophy.flame.100","awardedMonth":"2026-09"}],"order":["trophy.flame.100"],"constellation":{"stars":3}}""",
        )!!
        assertThat(showcase.items.map { it.count }).containsExactly(2, null).inOrder()
        assertThat(showcase.items.map { it.awardedMonth }).containsExactly("2026-10", "2026-09").inOrder()
        assertThat(showcase.constellation).isEqualTo(ShowcaseConstellation(3))

        val malformed = GameWave2Parser.userShowcase("""{"visible":false,"items":[],"order":[],"constellation":{"stars":"x"}}""")!!
        assertThat(malformed.constellation).isNull()
    }

    @Test
    fun `les reglages de confidentialite et le Prestige se lisent`() {
        assertThat(GameWave2Parser.privacy("""{"gameHidden":true,"friendsLeagueOptOut":false}"""))
            .isEqualTo(GamePrivacyResponse(gameHidden = true, friendsLeagueOptOut = false))
        val prestige = GameWave2Parser.prestige(
            """{"status":"already-passed","prestige":1,"score":0,"level":1,"gloryGained":1000,"trophyKey":"trophy.prestige.1"}""",
        )!!
        assertThat(prestige.alreadyDone).isTrue()
        assertThat(GameWave2Parser.showcaseOrder("""{"order":["a","b"]}""")!!.order).containsExactly("a", "b").inOrder()
        assertThat(
            GameWave2Parser.showcaseVisibility("""{"visibility":{"showcase":"me","rank":"me","treasury":"me","atlas":"me"}}""")!!
                .visibility.atlas,
        ).isEqualTo(ShowcaseVisibility.Me)
        assertThat(GameWave2Parser.consent("""{"consent":true,"pseudonym":null}""")).isEqualTo(LeagueConsentResponse(true, null))
        assertThat(GameWave2Parser.pseudonym("""{"pseudonym":"Zephyr"}""")!!.pseudonym).isEqualTo("Zephyr")
    }
}
