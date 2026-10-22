package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import me.meeshy.sdk.model.game.GameBlockFixtures.block
import me.meeshy.sdk.model.game.GameBlockFixtures.json
import org.junit.Test

class GameBlockParserTest {

    private fun parse(obj: JsonObject) = GameBlockParser.parse(obj)

    @Test
    fun `un bloc complet est lu champ pour champ`() {
        val game = parse(block())!!

        assertThat(game.level.level).isEqualTo(100)
        assertThat(game.level.ladder!!.level).isEqualTo(142)
        assertThat(game.level.ladder!!.tier).isEqualTo(LevelTierKey.Nebuleuse)
        assertThat(game.level.ladder!!.step!!.rank).isEqualTo(GloryRank.Voix)
        assertThat(game.level.ladder!!.steps!!.missionsDone).isEqualTo(12)
        assertThat(game.level.sparksLifetime).isEqualTo(7_000_000_000L)
        assertThat(game.glory.rank).isEqualTo(GloryRank.Polyglotte)
        assertThat(game.glory.shownDivision).isEqualTo(3)
        assertThat(game.treasury.access).hasSize(2)
        assertThat(game.mint.edition).isEqualTo(MeeshEdition.Silver)
        assertThat(game.missions.items).hasSize(2)
        assertThat(game.missions.items[1].isCompleted).isTrue()
        assertThat(game.missions.personal!!.state).isEqualTo(PersonalMissionState.Active)
        assertThat(game.chest.today!!.bonusWhole).isEqualTo(1221)
        assertThat(game.flame.form).isEqualTo(FlameFormKey.Flamme)
        assertThat(game.boosts.prismHour!!.contains(630)).isTrue()
        assertThat(game.guideSeen).containsExactly("welcome")
        assertThat(game.starFragments!!.collected).isEqualTo(4)
    }

    @Test
    fun `un bloc absent null ou vide se decode en null sans exception`() {
        assertThat(GameBlockParser.parse(null as String?)).isNull()
        assertThat(GameBlockParser.parse("")).isNull()
        assertThat(GameBlockParser.parse("null")).isNull()
        assertThat(GameBlockParser.parse("{")).isNull()
        assertThat(GameBlockParser.parse("[]")).isNull()
        assertThat(GameBlockParser.parse(JsonNull)).isNull()
        assertThat(GameBlockParser.fromEngagement("""{"level": 3}""")).isNull()
        assertThat(GameBlockParser.fromEngagement("""{"game": null}""")).isNull()
        assertThat(GameBlockParser.fromEngagement("not json")).isNull()
    }

    @Test
    fun `la cle game d'une charge d'engagement est lue`() {
        val payload = JsonObject(mapOf("score" to JsonPrimitive(1), "game" to block()))

        assertThat(GameBlockParser.fromEngagement(payload)!!.level.level).isEqualTo(100)
    }

    @Test
    fun `un bloc partiel se decode en null jamais a moitie lu`() {
        listOf("level", "glory", "treasury", "mint", "missions", "chest", "flame", "boosts", "guideSeen").forEach { key ->
            assertThat(parse(block(overrides = mapOf(key to null)))).isNull()
        }
    }

    @Test
    fun `un champ requis mal type rend null et ne leve pas`() {
        val badLevel = JsonObject(GameBlockFixtures.level().toMutableMap().apply { put("score", JsonPrimitive("abc")) })

        assertThat(parse(block(overrides = mapOf("level" to badLevel)))).isNull()
    }

    @Test
    fun `une cle de palier inconnue rend null le bloc entier`() {
        val unknownTier = JsonObject(GameBlockFixtures.level().toMutableMap().apply { put("tier", JsonPrimitive("hyperion")) })

        assertThat(parse(block(overrides = mapOf("level" to unknownTier)))).isNull()
    }

    @Test
    fun `une mission personnelle illisible tombe seule`() {
        val unreadable = buildJsonObject { put("id", "p1"); put("state", "teleported") }

        val game = parse(block(personal = unreadable))!!

        assertThat(game.missions.personal).isNull()
        assertThat(game.missions.items).hasSize(2)
        assertThat(game.level.level).isEqualTo(100)
        assertThat(game.flame.days).isEqualTo(8)
        assertThat(game.chest.status).isEqualTo(ChestStatus.Ready)
    }

    @Test
    fun `une mission personnelle absente ou nulle se lit null`() {
        assertThat(parse(block(personal = null))!!.missions.personal).isNull()
        assertThat(parse(block(personal = JsonNull))!!.missions.personal).isNull()
    }

    @Test
    fun `un contenu du jour du coffre illisible tombe seul`() {
        val chest = JsonObject(GameBlockFixtures.chest().toMutableMap().apply { put("today", JsonPrimitive("???")) })

        val game = parse(block(overrides = mapOf("chest" to chest)))!!

        assertThat(game.chest.today).isNull()
        assertThat(game.chest.odds.maxPoints).isEqualTo(10000)
    }

    @Test
    fun `les extensions optionnelles illisibles tombent seules`() {
        val game = parse(
            block(overrides = mapOf("starFragments" to JsonPrimitive("x"))),
        )!!

        assertThat(game.starFragments).isNull()
    }

    @Test
    fun `un serveur anterieur sans ladder ni etincelles se lit sur les champs d'hier`() {
        val legacy = JsonObject(
            GameBlockFixtures.level(withLadder = false).toMutableMap().apply {
                remove("sparks"); remove("sparksCycle"); remove("sparksLifetime"); remove("levelMaxLifetime"); remove("sparksDebt")
            },
        )

        val level = parse(block(overrides = mapOf("level" to legacy)))!!.level

        assertThat(level.ladder).isNull()
        assertThat(level.sparks).isNull()
        assertThat(level.shown.level).isEqualTo(100)
        assertThat(level.shown.isMax).isTrue()
        assertThat(level.shownLevelMaxLifetime).isEqualTo(100)
    }

    @Test
    fun `un champ inconnu ajoute par un serveur plus recent est ignore`() {
        val extra = JsonObject(
            block().toMutableMap().apply {
                put("league", buildJsonObject { put("whatever", 1) })
                put("futureThing", JsonPrimitive(true))
            },
        )
        val flameWithExtra = JsonObject(GameBlockFixtures.flame().toMutableMap().apply { put("aura", JsonPrimitive("x")) })

        assertThat(parse(extra)).isNotNull()
        assertThat(parse(block(overrides = mapOf("flame" to flameWithExtra)))).isNotNull()
    }

    @Test
    fun `une edition de Meesh inconnue se lit null sans faire echouer le bloc`() {
        val game = parse(block(overrides = mapOf("mint" to GameBlockFixtures.mint(edition = "obsidian"))))!!

        assertThat(game.mint.edition).isNull()
        assertThat(game.mint.price).isEqualTo(1588)
    }

    @Test
    fun `une reserve inconnue du tresor est sautee sans emporter la liste`() {
        val access = JsonArray(
            (GameBlockFixtures.treasury()["access"] as JsonArray) +
                buildJsonObject { put("key", "abyss"); put("minHeld", 9); put("locked", true) },
        )
        val treasury = JsonObject(GameBlockFixtures.treasury().toMutableMap().apply { put("access", access) })

        val parsed = parse(block(overrides = mapOf("treasury" to treasury)))!!.treasury

        assertThat(parsed.access!!.map { it.key }).containsExactly(TreasuryTierKey.Bourse, TreasuryTierKey.Tresor).inOrder()
    }

    @Test
    fun `une place du Mythe illisible ou hors bornes se tait`() {
        val seat = buildJsonObject { put("number", 101); put("edition", 1) }
        val glory = JsonObject(
            GameBlockFixtures.glory().toMutableMap().apply { put("rank", JsonPrimitive("mythe")); put("mythic", seat) },
        )

        val parsed = parse(block(overrides = mapOf("glory" to glory)))!!.glory

        assertThat(parsed.mythic).isNull()
        assertThat(parsed.mythicSeat).isNull()
    }

    @Test
    fun `le blocage de frappe se dit dans l'ordre dette reserve etincelles`() {
        val locked = GameMintLock(TreasuryTierKey.Tresor, 500, RankRequirement(GloryRank.Voix, 1, 1))
        val base = parse(block())!!.mint.copy(missingPoints = 10, locked = locked)

        assertThat(base.copy(sparksDebt = 7).blocker).isEqualTo(GameMintPreview.Blocker.SparksDebt(7))
        assertThat(base.blocker).isEqualTo(GameMintPreview.Blocker.TreasuryLocked(locked))
        assertThat(base.copy(locked = null).blocker).isEqualTo(GameMintPreview.Blocker.MissingSparks(10))
        assertThat(base.copy(locked = null, missingPoints = 0).blocker).isNull()
    }

    @Test
    fun `les cles optionnelles s'encodent en null et la copie de cache relue est la reponse serveur`() {
        val served = block(personal = null)
        val game = parse(served)!!

        val encoded = json.encodeToString(game)
        val reread = GameBlockParser.parse(encoded)!!
        val tree = json.parseToJsonElement(encoded) as JsonObject

        assertThat(reread).isEqualTo(game)
        assertThat((tree["missions"] as JsonObject)["personal"]).isEqualTo(JsonNull)
        assertThat((tree["level"] as JsonObject)["ladder"]).isNotEqualTo(JsonNull)
        assertThat(((tree["chest"] as JsonObject)["reward"])).isEqualTo(JsonNull)
        assertThat((tree["mint"] as JsonObject)["locked"]).isEqualTo(JsonNull)
        assertThat((tree["mint"] as JsonObject).containsKey("blockedBy")).isTrue()
    }

    @Test
    fun `un bloc sans aucune extension se reecrit avec toutes ses cles optionnelles a null`() {
        val minimal = JsonObject(
            block().toMutableMap().apply {
                put("level", JsonObject(GameBlockFixtures.level(false).filterKeys { !it.startsWith("sparks") && it != "levelMaxLifetime" }))
                remove("starFragments")
            },
        )

        val tree = json.parseToJsonElement(json.encodeToString(parse(minimal)!!)) as JsonObject
        val level = tree["level"] as JsonObject

        listOf("ladder", "sparks", "sparksCycle", "sparksLifetime", "sparksDebt", "levelMaxLifetime").forEach {
            assertThat(level[it]).isEqualTo(JsonNull)
        }
        assertThat(tree["starFragments"]).isEqualTo(JsonNull)
    }

    @Test
    fun `la mission personnelle s'encode a plat comme une mission`() {
        val tree = json.parseToJsonElement(json.encodeToString(parse(block())!!)) as JsonObject
        val personal = (tree["missions"] as JsonObject)["personal"] as JsonObject

        assertThat(personal.keys).containsAtLeast("id", "templateKey", "startsAt", "endsAt", "state")
        assertThat(personal.containsKey("mission")).isFalse()
    }
}
