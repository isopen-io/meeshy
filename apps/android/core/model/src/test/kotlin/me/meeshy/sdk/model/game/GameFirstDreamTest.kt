package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgressResolver
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.sdk.model.game.progression.ProgressionConceptStates
import org.junit.Test

/**
 * Le premier Rêve, sous le niveau 5 (#17370, tranche Android #20120) — miroir de
 * `packages/shared/__tests__/game/contract.test.ts` (champ `fullDreamIn` tolérant), de `GameFirstDreamTests` (SDK
 * Swift) et de `apps/web/src/lib/view/player-banner.test.ts` (sa pièce du bandeau).
 */
class GameFirstDreamTest {

    private fun missionsJson(unlocked: Boolean, items: List<JsonObject>, fullDreamIn: JsonElement? = null) = buildJsonObject {
        put("dayKey", "2026-11-21")
        put("prismDay", false)
        put("unlocked", unlocked)
        put("items", JsonArray(items))
        put("rerollAvailable", false)
        if (fullDreamIn != null) put("fullDreamIn", fullDreamIn)
    }

    private val easyAct = GameBlockFixtures.mission("m0")

    private fun game(missions: JsonObject): GameBlock =
        checkNotNull(GameBlockParser.parse(GameBlockFixtures.block(overrides = mapOf("missions" to missions))))

    private fun firstDream(fullDreamIn: JsonElement? = JsonPrimitive(600)) =
        game(missionsJson(unlocked = false, items = listOf(easyAct), fullDreamIn = fullDreamIn))

    private fun olderServer() = game(missionsJson(unlocked = false, items = emptyList()))

    private fun missionsState(block: GameBlock) = ProgressionConceptStates.stateLine(
        ProgressionConcept.Missions,
        EngagementProgressResolver.resolve(ApiEngagementProgress.empty.copy(game = block)),
        block,
    )

    @Test
    fun `sous le niveau 5, la passerelle sert les etincelles qui manquent avant le Reve complet`() {
        val missions = firstDream().missions
        assertThat(missions.fullDreamIn).isEqualTo(600)
        assertThat(missions.items).hasSize(1)
    }

    @Test
    fun `un serveur anterieur ne sert pas le champ - il reste absent, le bloc se lit`() {
        assertThat(olderServer().missions.fullDreamIn).isNull()
    }

    @Test
    fun `une valeur illisible ou negative tombe seule, sans emporter le Reve`() {
        val unreadable = firstDream(JsonPrimitive("600")).missions
        val negative = firstDream(JsonPrimitive(-3)).missions
        assertThat(unreadable.fullDreamIn).isNull()
        assertThat(unreadable.items).hasSize(1)
        assertThat(negative.fullDreamIn).isNull()
    }

    @Test
    fun `le champ survit au cache - encoder puis relire le rend a l'identique`() {
        val missions = firstDream().missions
        val json = GameBlockFixtures.json
        val again = json.decodeFromString(GameMissions.serializer(), json.encodeToString(GameMissions.serializer(), missions))
        assertThat(again).isEqualTo(missions)
    }

    @Test
    fun `le remplacement optimiste d'un acte garde le champ`() {
        val missions = firstDream().missions
        assertThat(missions.replacing(rerollAvailable = false).fullDreamIn).isEqualTo(600)
    }

    @Test
    fun `l'ecran du Reve n'est une porte fermee que devant un serveur anterieur`() {
        assertThat(firstDream().missions.showsDoorOnly).isFalse()
        assertThat(olderServer().missions.showsDoorOnly).isTrue()
        assertThat(checkNotNull(GameBlockParser.parse(GameBlockFixtures.block())).missions.showsDoorOnly).isFalse()
    }

    @Test
    fun `changer un acte reste au niveau 5 - le premier Reve ne le propose pas`() {
        val now = Instant.parse("2026-11-21T08:00:00Z").toEpochMilli()
        val missions = firstDream().missions
        assertThat(GameMissionCardLaws.rerollRowShown(missions, null, affordable = false, nowMillis = now)).isFalse()
        assertThat(GameMissionCardLaws.rerollRowShown(missions.copy(rerollAvailable = true), null, affordable = true, nowMillis = now)).isFalse()
    }

    @Test
    fun `le bandeau - le premier Reve a sa piece, qui dit son acte unique`() {
        val banner = checkNotNull(GamePlayerBanner.of(firstDream()))
        assertThat(banner.dailyMission).isEqualTo(GamePlayerBanner.DailyMission(done = 0, total = 1))
    }

    @Test
    fun `le bandeau, devant un serveur anterieur sous le niveau 5 - aucun acte servi, aucune piece`() {
        assertThat(GamePlayerBanner.of(olderServer()).dailyMission).isNull()
    }

    @Test
    fun `la fiche du Reve dit 0 sur 1 acte au lieu du niveau 5`() {
        val block = firstDream().let { it.copy(chest = it.chest.copy(status = ChestStatus.Locked)) }
        val said = checkNotNull(missionsState(block))
        assertThat(said.text.key).isEqualTo(GameTextKey.StateMissionsProgress)
    }

    @Test
    fun `la fiche, devant un serveur anterieur, garde la condition du niveau 5`() {
        val said = checkNotNull(missionsState(olderServer()))
        assertThat(said.text.key).isNotEqualTo(GameTextKey.StateMissionsProgress)
    }
}
