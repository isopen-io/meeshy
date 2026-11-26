package me.meeshy.sdk.model.game.guide

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.FlameGoalLocal
import me.meeshy.sdk.model.game.FlameGoalSection
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameFlameGoalLaw
import me.meeshy.sdk.model.game.GameServedFlameGoal
import me.meeshy.sdk.model.game.LeagueKey
import me.meeshy.sdk.model.game.guide.GuideTestGames.beginner
import me.meeshy.sdk.model.game.guide.GuideTestGames.onboardingDone
import me.meeshy.sdk.model.game.photo.GamePhotoMomentsV2
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.sdk.model.game.rules.GuideMood
import me.meeshy.sdk.model.game.rules.GuideSpeaker
import org.junit.Test

/**
 * L'OBJECTIF DE FLAMME ATTEINT, SALUÉ PAR MEE ET MEO (#20603, sous #20546) — miroir de `GuideEventV2.seenKey`,
 * `GameGuideEventsV2.goalReached` et `GameFlamePanelView.GoalSection.next` (iOS, #20602) et de `guideSeenKeyV2` (web,
 * #20604). Un objectif se salue UNE fois, par la carte de guide ou par la carte de la Flamme, et la marche suivante reste
 * choisissable une fois le salut dit.
 */
class GameGuideFlameGoalTest {

    private fun reached(target: Int, next: Int?): GameServedFlameGoal =
        GameServedFlameGoal(listOfNotNull(next), GameServedFlameGoal.Current(target, 0, true, next))

    private fun game(goal: GameServedFlameGoal?, seen: List<String> = emptyList()): GameBlock {
        val base = beginner(seen)
        return base.copy(flame = base.flame.copy(days = 7, goal = goal))
    }

    private val running = GameServedFlameGoal(emptyList(), GameServedFlameGoal.Current(7, 2, false, null))

    @Test
    fun `la cle vue du moment est celle de l objectif, et le genre des autres moments`() {
        assertThat(GuideEventV2.FlameGoalReached(7, 14).key).isEqualTo(GuideMomentKeyV2.FlameGoalReached)
        assertThat(GuideMomentKeyV2.FlameGoalReached.wire).isEqualTo("flame-goal-reached")
        assertThat(GuideEventV2.FlameGoalReached(7, 14).seenKey).isEqualTo("flame-goal-next-7")
        assertThat(GuideEventV2.FlameGoalReached(30, null).seenKey).isEqualTo(GameFlameGoalLaw.nextSeenKey(30))
        assertThat(GuideEventV2.FlameFreezeGift(1).seenKey).isEqualTo("flame-freeze-gift")
        assertThat(GuideAnyEvent.Wave2(GuideEventV2.FlameGoalReached(7, 14)).seenKey).isEqualTo("flame-goal-next-7")
        assertThat(GuideAnyEvent.Wave2(GuideEventV2.FlameGoalReached(7, 14)).wire).isEqualTo("flame-goal-reached")
    }

    @Test
    fun `Mee et Meo, fiers, disent l objectif et menent a la Flamme, sans photo`() {
        val moment = GameGuideV2.moment(GuideEventV2.FlameGoalReached(7, 14), emptySet())
        val card = GameGuideCards.of(moment)

        assertThat(moment.speaker).isEqualTo(GuideSpeaker.Duo)
        assertThat(moment.mood).isEqualTo(GuideMood.Proud)
        assertThat(moment.action).isEqualTo(GuideActionV2.SeeFlame)
        assertThat(moment.seenKey).isEqualTo("flame-goal-next-7")
        assertThat(card.key).isEqualTo("flame-goal-next-7")
        assertThat(card.photo).isFalse()
        assertThat(card.destination).isEqualTo(GuideDestination.Concept(ProgressionConcept.Flame))
        assertThat(GamePhotoMomentsV2.emblem(GuideEventV2.FlameGoalReached(7, 14))).isNull()
    }

    @Test
    fun `la presentation courte se lit sur la cle de l objectif, pas sur le genre`() {
        val event = GuideEventV2.FlameGoalReached(14, 30)

        assertThat(GameGuideV2.moment(event, setOf("flame-goal-reached")).presentation).isEqualTo(GuidePresentation.Full)
        assertThat(GameGuideV2.moment(event, setOf("flame-goal-next-7")).presentation).isEqualTo(GuidePresentation.Full)
        assertThat(GameGuideV2.moment(event, setOf("flame-goal-next-14")).presentation).isEqualTo(GuidePresentation.Short)
    }

    @Test
    fun `le moment passe juste apres la Veilleuse offerte et devant une montee de ligue`() {
        val rank = { key: String -> GameGuideV2.momentPriority.indexOf(key) }
        val chosen = GameGuideV2.chooseMoment(
            listOf(
                GuideAnyEvent.Wave2(GuideEventV2.LeaguePromoted(LeagueKey.entries[0], LeagueKey.entries[1], 2, "2026-W48")),
                GuideAnyEvent.Wave2(GuideEventV2.FlameGoalReached(7, 14)),
            ),
            emptySet(),
        )

        assertThat(rank("flame-goal-reached")).isEqualTo(rank("flame-freeze-gift") + 1)
        assertThat(rank("league-promoted")).isEqualTo(rank("flame-goal-reached") + 1)
        assertThat((chosen as GuideAnyMoment.Wave2).moment.key).isEqualTo(GuideMomentKeyV2.FlameGoalReached)
    }

    @Test
    fun `un objectif deja salue cede sa place a un moment inedit`() {
        val chosen = GameGuideV2.chooseMoment(
            listOf(
                GuideAnyEvent.Wave2(GuideEventV2.FlameGoalReached(7, 14)),
                GuideAnyEvent.Wave2(GuideEventV2.AtlasStamp("ja", 4, 89)),
            ),
            setOf("flame-goal-next-7"),
        )

        assertThat((chosen as GuideAnyMoment.Wave2).moment.key).isEqualTo(GuideMomentKeyV2.AtlasStamp)
    }

    @Test
    fun `l ouverture dit l objectif atteint tant que sa cle n est ni servie ni marquee`() {
        assertThat(GameGuideEventsV2.standing(game(reached(7, 14)), emptySet()))
            .containsExactly(GuideEventV2.FlameGoalReached(7, 14))
        assertThat(GameGuideEventsV2.standing(game(reached(365, null)), emptySet()))
            .containsExactly(GuideEventV2.FlameGoalReached(365, null))
        assertThat(GameGuideEventsV2.standing(game(reached(7, 14), listOf("flame-goal-next-7")), emptySet())).isEmpty()
        assertThat(GameGuideEventsV2.standing(game(reached(7, 14)), setOf("flame-goal-next-7"))).isEmpty()
        assertThat(GameGuideEventsV2.standing(game(reached(14, 30), listOf("flame-goal-next-7")), emptySet()))
            .containsExactly(GuideEventV2.FlameGoalReached(14, 30))
        assertThat(GameGuideEventsV2.standing(game(running), emptySet())).isEmpty()
        assertThat(GameGuideEventsV2.standing(game(null), emptySet())).isEmpty()
    }

    @Test
    fun `l objectif se dit en arrivant, et une nouvelle marche tenue est un moment nouveau`() {
        assertThat(GameGuideEventsV2.transition(game(running), game(reached(7, 14))))
            .containsExactly(GuideEventV2.FlameGoalReached(7, 14))
        assertThat(GameGuideEventsV2.transition(game(reached(7, 14)), game(reached(7, 14)))).isEmpty()
        assertThat(GameGuideEventsV2.transition(game(reached(7, 14)), game(reached(14, 30))))
            .containsExactly(GuideEventV2.FlameGoalReached(14, 30))
        assertThat(GameGuideEventsV2.transition(game(running), game(reached(7, 14), listOf("flame-goal-next-7")))).isEmpty()
        assertThat(GameGuideEventsV2.transition(game(reached(7, 14)), game(running))).isEmpty()
    }

    @Test
    fun `la carte montree marque la cle de l objectif, que la carte de la Flamme lit deja`() {
        val sent = mutableListOf<List<String>>()
        val session = GameGuideSession(
            visits = object : GuideVisitStore {
                override fun lastVisitDay(): String? = "2026-11-26"
                override fun rememberVisit(day: String) = Unit
            },
            memory = null,
            today = { "2026-11-26" },
            markSeen = { sent += it },
        )

        session.observe(game(reached(7, 14), onboardingDone))

        assertThat(session.card?.key).isEqualTo("flame-goal-next-7")
        assertThat(sent).containsExactly(listOf("flame-goal-next-7"))
        assertThat(GameFlameGoalLaw.section(reached(7, 14), onboardingDone + sent.flatten()))
            .isEqualTo(FlameGoalSection.Next(7, 14))
    }

    @Test
    fun `une fois le salut dit, la carte de la Flamme garde la marche suivante, et au sommet plus rien`() {
        assertThat(GameFlameGoalLaw.section(reached(7, 14), listOf("flame-goal-next-7"))).isEqualTo(FlameGoalSection.Next(7, 14))
        assertThat(GameFlameGoalLaw.section(reached(365, null), listOf("flame-goal-next-365"))).isNull()
        assertThat(GameFlameGoalLaw.section(reached(7, 14), emptyList())).isEqualTo(FlameGoalSection.Reached(7, 14))
        assertThat(FlameGoalLocal(closedSigns = setOf(7)).section(reached(7, 14), emptyList()))
            .isEqualTo(FlameGoalSection.Next(7, 14))
    }
}
