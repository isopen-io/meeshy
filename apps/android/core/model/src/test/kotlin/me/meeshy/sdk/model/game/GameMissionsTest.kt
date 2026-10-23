package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.game.GameLawVectors.array
import me.meeshy.sdk.model.game.GameLawVectors.boolValue
import me.meeshy.sdk.model.game.GameLawVectors.intValue
import me.meeshy.sdk.model.game.GameLawVectors.obj
import me.meeshy.sdk.model.game.GameLawVectors.text
import org.junit.Test

class GameMissionsTest {

    private fun draw(level: Int, treasury: Int = 0, userId: String = "u1", flame: Int = 5) =
        GameMissionLaws.draw(MissionDrawInput(userId, "2026-10-05", level, flame, treasury))

    private fun JsonObject.asMission(): DrawnMission = DrawnMission(
        difficulty = MissionDifficulty.valueOf(this["difficulty"].text().replaceFirstChar { it.uppercase() }),
        templateKey = this["templateKey"].text(),
        signal = this["signal"].text(),
        prism = this["prism"].boolValue(),
        target = this["target"].intValue()!!,
        reward = this["reward"].intValue()!!,
        glory = this["glory"].intValue()!!,
    )

    @Test
    fun `trois missions par jour dans l'ordre facile moyenne difficile`() {
        assertThat(draw(20).missions.map { it.difficulty })
            .containsExactly(MissionDifficulty.Easy, MissionDifficulty.Medium, MissionDifficulty.Hard).inOrder()
    }

    @Test
    fun `la difficile devient mission d'Or au niveau 50`() {
        assertThat(draw(49).missions.last().difficulty).isEqualTo(MissionDifficulty.Hard)
        assertThat(draw(50).missions.last().difficulty).isEqualTo(MissionDifficulty.Gold)
        assertThat(draw(50).missions.last().glory).isEqualTo(500)
    }

    @Test
    fun `la difficile devient mission d'Or a 50 Meesh gardees`() {
        assertThat(draw(10, treasury = 49).missions.last().difficulty).isEqualTo(MissionDifficulty.Hard)
        assertThat(draw(10, treasury = 50).missions.last().difficulty).isEqualTo(MissionDifficulty.Gold)
    }

    @Test
    fun `le tirage est deterministe et varie selon l'utilisateur`() {
        assertThat(draw(20)).isEqualTo(draw(20))
        val others = (1..20).map { draw(20, userId = "user-$it").missions.map { m -> m.templateKey } }.toSet()
        assertThat(others.size).isGreaterThan(1)
    }

    @Test
    fun `aucun signal n'est tire deux fois le meme jour`() {
        (1..50).forEach { n ->
            val signals = draw(30, userId = "user-$n").missions.map { it.signal }
            assertThat(signals).containsNoDuplicates()
        }
    }

    @Test
    fun `un signal indisponible n'est jamais tire`() {
        val blocked = draw(20).missions.map { it.signal }.toSet()
        val redrawn = GameMissionLaws.draw(MissionDrawInput("u1", "2026-10-05", 20, 5, 0, unavailableSignals = blocked))
        assertThat(redrawn.missions.map { it.signal }.toSet().intersect(blocked)).isEmpty()
    }

    @Test
    fun `objectif et recompense sont exacts en entiers`() {
        assertThat(GameMissionLaws.objective(5, 5)).isEqualTo(5)
        assertThat(GameMissionLaws.objective(5, 34)).isEqualTo(10)
        assertThat(GameMissionLaws.reward(60, 34, 23)).isEqualTo(127)
        assertThat(GameMissionLaws.band(250)).isEqualTo(10)
        assertThat(GameMissionLaws.band(0)).isEqualTo(0)
    }

    @Test
    fun `le catalogue complet est celui du serveur`() {
        assertThat(GameMissionCatalog.templates).hasSize(31)
        assertThat(GameMissionCatalog.templates.map { it.key }).containsNoDuplicates()
        assertThat(GameMissionLaws.templatesFor(MissionDifficulty.Gold).map { it.key }).contains("long-chat")
    }

    @Test
    fun `un profil sans habitude ramene l'objectif au plancher du gabarit`() {
        val template = GameMissionCatalog.template("send-texts")!!
        val profile = MissionProfile(emptySet(), emptyMap())
        assertThat(GameMissionLaws.target(template, MissionDifficulty.Easy, 40, profile)).isEqualTo(template.minTarget)
    }

    @Test
    fun `changer une mission rend une autre du meme niveau de difficulte sans doublon`() {
        val today = draw(30).missions
        today.indices.forEach { i ->
            val replaced = GameMissionLaws.reroll("u1", "2026-10-05", 30, 5, today, i, 1)!!
            assertThat(replaced.difficulty).isEqualTo(today[i].difficulty)
            assertThat(replaced.templateKey).isNotEqualTo(today[i].templateKey)
            assertThat(today.map { it.signal }).doesNotContain(replaced.signal)
        }
        assertThat(GameMissionLaws.reroll("u1", "2026-10-05", 30, 5, today, 9, 1)).isNull()
    }

    @Test
    fun `une mission impossible non achevee recoit un gabarit de meme difficulte`() {
        val today = draw(20).missions
        val broken = today[0].copy(signal = "axis:gone")
        val replaced = GameMissionLaws.replaceImpossible(
            "u1", "2026-10-05", 20, 5,
            listOf(DayMission(broken, completed = false), DayMission(today[1], false), DayMission(today[2], false)),
            unavailableSignals = setOf("axis:gone"),
        )
        assertThat(replaced.map { it.index }).containsExactly(0)
        assertThat(replaced[0].mission.difficulty).isEqualTo(MissionDifficulty.Easy)
        val done = GameMissionLaws.replaceImpossible("u1", "2026-10-05", 20, 5, listOf(DayMission(broken, completed = true)), setOf("axis:gone"))
        assertThat(done).isEmpty()
    }

    @Test
    fun `la journee de jeu est monotone`() {
        val opened = 1_000_000L
        assertThat(GameMissionLaws.resolveGameDayKey("2026-10-06", null, null, opened)).isEqualTo("2026-10-06")
        assertThat(GameMissionLaws.resolveGameDayKey("2026-10-04", "2026-10-05", opened, opened)).isEqualTo("2026-10-05")
        assertThat(GameMissionLaws.resolveGameDayKey("2026-10-06", "2026-10-05", opened, opened + 19 * 3_600_000L)).isEqualTo("2026-10-05")
        assertThat(GameMissionLaws.resolveGameDayKey("2026-10-06", "2026-10-05", opened, opened + 21 * 3_600_000L)).isEqualTo("2026-10-06")
    }

    @Test
    fun `l'artefact d'une mission du jour compte pour le coffre, la personnelle non`() {
        val mission = draw(20).missions.first()
        assertThat(GameMissionLaws.artifacts(mission, 0).chest).isTrue()
        assertThat(GameMissionLaws.artifacts(mission, GamePersonalMissionLaw.SLOT).chest).isFalse()
    }

    @Test
    fun `les vecteurs partages de missions sont rejoues`() {
        GameLawVectors.cases("mission-objective").forEach {
            assertWithMessage(it.label).that(GameMissionLaws.objective(it.int("baseTarget"), it.int("level"))).isEqualTo(it.expected["target"].intValue())
        }
        GameLawVectors.cases("mission-reward").forEach {
            assertWithMessage(it.label).that(GameMissionLaws.reward(it.int("basePoints"), it.int("level"), it.int("flameDays"))).isEqualTo(it.expected["reward"].intValue())
        }
        GameLawVectors.cases("missions-draw").forEach {
            val result = GameMissionLaws.draw(
                MissionDrawInput(
                    it.str("userId"), it.str("dayKey"), it.int("level"), it.int("flameDays"), it.int("treasury"),
                    unavailableSignals = it.input["unavailableSignals"].array().map { s -> s.text() }.toSet(),
                ),
            )
            assertWithMessage(it.label).that(result.prismDay).isEqualTo(it.expected["prismDay"].boolValue())
            assertWithMessage(it.label).that(result.missions).isEqualTo(it.expected["missions"].array().map { m -> m.obj().asMission() })
        }
        GameLawVectors.cases("mission-reroll").forEach {
            val today = GameMissionLaws.draw(MissionDrawInput(it.str("userId"), it.str("dayKey"), it.int("level"), it.int("flameDays"), 0))
            val rerolled = GameMissionLaws.reroll(it.str("userId"), it.str("dayKey"), it.int("level"), it.int("flameDays"), today.missions, it.int("index"), it.int("rerollCount"))
            assertWithMessage(it.label).that(rerolled).isEqualTo(it.expected["mission"].obj().asMission())
        }
    }
}
