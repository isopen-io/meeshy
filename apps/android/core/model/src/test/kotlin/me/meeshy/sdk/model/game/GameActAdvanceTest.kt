package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Les cas du témoin partagé (`packages/shared/__tests__/game/act-advance.test.ts`), rejoués sur le miroir Kotlin. */
class GameActAdvanceTest {

    private fun act(id: String, difficulty: MissionDifficulty, progress: Int, target: Int) = GameMission(
        id = id, templateKey = "t-$id", difficulty = difficulty, signal = "message", prism = false,
        target = target, progress = progress, reward = 10, glory = 10,
    )

    private fun game(items: List<GameMission>, dayKey: String = "2026-11-18", unlocked: Boolean = true) =
        GameMissions(dayKey = dayKey, prismDay = false, unlocked = unlocked, items = items, rerollAvailable = false)

    private fun day(medium: Int, hard: Int = 0) = game(
        listOf(
            act("a", MissionDifficulty.Easy, 1, 1),
            act("b", MissionDifficulty.Medium, medium, 5),
            act("c", MissionDifficulty.Hard, hard, 8),
        ),
    )

    @Test
    fun `l'acte dont la progression monte est rendu avec sa nouvelle progression et son objectif`() {
        assertThat(GameActAdvance.between(day(2), day(3), hidden = false))
            .isEqualTo(GameActAdvance(MissionDifficulty.Medium, 3, 5))
    }

    @Test
    fun `un acte qui atteint son objectif est rendu aussi`() {
        assertThat(GameActAdvance.between(day(4), day(5), hidden = false))
            .isEqualTo(GameActAdvance(MissionDifficulty.Medium, 5, 5))
    }

    @Test
    fun `une progression servie au-dela de l'objectif se lit a l'objectif`() {
        assertThat(GameActAdvance.between(day(4), day(7), hidden = false))
            .isEqualTo(GameActAdvance(MissionDifficulty.Medium, 5, 5))
    }

    @Test
    fun `quand deux actes avancent ensemble, le premier dans l'ordre du jour parle`() {
        assertThat(GameActAdvance.between(day(2, 1), day(3, 2), hidden = false))
            .isEqualTo(GameActAdvance(MissionDifficulty.Medium, 3, 5))
    }

    @Test
    fun `aucun acte n'avance, ou une progression baisse - rien`() {
        assertThat(GameActAdvance.between(day(2), day(2), hidden = false)).isNull()
        assertThat(GameActAdvance.between(day(3), day(2), hidden = false)).isNull()
    }

    @Test
    fun `Jeu masque - rien, meme quand un acte avance`() {
        assertThat(GameActAdvance.between(day(2), day(3), hidden = true)).isNull()
    }

    @Test
    fun `un nouveau jour n'est pas une avancee`() {
        val tomorrow = game(listOf(act("b", MissionDifficulty.Medium, 3, 5)), dayKey = "2026-11-19")
        assertThat(GameActAdvance.between(day(2), tomorrow, hidden = false)).isNull()
    }

    @Test
    fun `un acte remplace par une relance n'est pas une avancee`() {
        val rerolled = game(
            listOf(
                act("a", MissionDifficulty.Easy, 1, 1),
                act("z", MissionDifficulty.Medium, 3, 5),
                act("c", MissionDifficulty.Hard, 0, 8),
            ),
        )
        assertThat(GameActAdvance.between(day(2), rerolled, hidden = false)).isNull()
    }

    @Test
    fun `actes pas encore ouverts - rien`() {
        val before = game(listOf(act("b", MissionDifficulty.Medium, 2, 5)), unlocked = false)
        val after = game(listOf(act("b", MissionDifficulty.Medium, 3, 5)), unlocked = false)
        assertThat(GameActAdvance.between(before, after, hidden = false)).isNull()
    }

    @Test
    fun `sans lecture d'avant ou d'apres - rien, jamais une exception`() {
        assertThat(GameActAdvance.between(null, day(3), hidden = false)).isNull()
        assertThat(GameActAdvance.between(day(2), null, hidden = false)).isNull()
    }

    @Test
    fun `le guet arme par un envoi parle a la lecture suivante, dans les quinze secondes`() {
        val watch = GameActAdvanceWatch().armed(nowMillis = 1_000, cached = day(2), hidden = false)
        val reading = watch.received(nowMillis = 1_000 + 14_999, missions = day(3), hidden = false)
        assertThat(reading.advance).isEqualTo(GameActAdvance(MissionDifficulty.Medium, 3, 5))
        assertThat(reading.watch.last).isEqualTo(day(3))
    }

    @Test
    fun `hors du guet une lecture ne parle pas, mais devient l'avant de la suivante`() {
        val idle = GameActAdvanceWatch().received(nowMillis = 0, missions = day(2), hidden = false)
        assertThat(idle.advance).isNull()
        val late = GameActAdvanceWatch().armed(0, day(2), hidden = false).received(15_000, day(3), hidden = false)
        assertThat(late.advance).isNull()
        val next = late.watch.armed(20_000, cached = null, hidden = false).received(20_001, day(4), hidden = false)
        assertThat(next.advance).isEqualTo(GameActAdvance(MissionDifficulty.Medium, 4, 5))
    }

    @Test
    fun `Jeu masque - l'envoi n'arme pas le guet`() {
        val watch = GameActAdvanceWatch().armed(nowMillis = 0, cached = day(2), hidden = true)
        assertThat(watch.isArmed(1)).isFalse()
        assertThat(watch.received(1, day(3), hidden = true).advance).isNull()
    }

    @Test
    fun `une lecture absente (ancien serveur) ne change rien au guet`() {
        val watch = GameActAdvanceWatch().armed(0, day(2), hidden = false)
        val reading = watch.received(1, missions = null, hidden = false)
        assertThat(reading.advance).isNull()
        assertThat(reading.watch).isEqualTo(watch)
    }
}
