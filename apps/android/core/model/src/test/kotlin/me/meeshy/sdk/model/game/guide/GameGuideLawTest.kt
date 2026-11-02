package me.meeshy.sdk.model.game.guide

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.FlameStatus
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.LeagueKey
import me.meeshy.sdk.model.game.LevelTierKey
import me.meeshy.sdk.model.game.TreasuryTierKey
import me.meeshy.sdk.model.game.guide.GuideTestGames.atLevel
import me.meeshy.sdk.model.game.guide.GuideTestGames.beginner
import me.meeshy.sdk.model.game.guide.GuideTestGames.withFlame
import me.meeshy.sdk.model.game.guide.GuideTestGames.withRank
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.sdk.model.game.rules.GuideMood
import me.meeshy.sdk.model.game.rules.GuideSpeaker
import me.meeshy.sdk.model.game.rules.OnboardingStepKey
import org.junit.Test

/**
 * LA LOI DU GUIDE (#13885) — miroir de `GameGuide`, `GameGuideV2`, `GameGuideEvents`, `GameGuideEventsV2` et
 * `GameGuideTarget` (iOS) : quels événements l'état et les transitions produisent, quel moment gagne, où mène son bouton.
 */
class GameGuideLawTest {

    @Test
    fun `un debutant n'a rien a decouvrir, et une absence de sept jours se dit`() {
        val game = beginner()

        assertThat(GameGuideEvents.standing(game, emptySet(), daysAway = 6)).isEmpty()
        assertThat(GameGuideEvents.standing(game, emptySet(), daysAway = 7))
            .containsExactly(GuideEvent.ReturnAfterAbsence(7))
    }

    @Test
    fun `une decouverte vue ne se redit pas, une urgence se redit toujours`() {
        val game = withFlame(atLevel(beginner(), 3), FlameStatus.AtRisk, days = 4)
        val seen = setOf("first-level", "flame-at-risk")

        assertThat(GameGuideEvents.standing(game, seen, daysAway = null)).containsExactly(GuideEvent.FlameAtRisk(4))
        assertThat(GameGuideEvents.standing(game, emptySet(), daysAway = null))
            .containsExactly(GuideEvent.FirstLevel(3, 40), GuideEvent.FlameAtRisk(4)).inOrder()
    }

    @Test
    fun `une division gagnee est une marche, la marche retrouvee n'en est pas une`() {
        val five = withRank(beginner(), GloryRank.Echo, division5 = 5)
        val four = withRank(beginner(), GloryRank.Echo, division5 = 4)

        assertThat(GameGuideEvents.transitions(five, four)).containsExactly(GuideEvent.NewRank(GloryRank.Echo, 4, 70000, 100))
        assertThat(GameGuideEvents.transitions(four, five)).isEmpty()
    }

    @Test
    fun `les transitions disent le premier niveau, la premiere frappe, le palier et la Flamme eteinte`() {
        val before = beginner()
        val after = withFlame(
            atLevel(before, 10, LevelTierKey.Lueur).copy(mint = before.mint.copy(number = 2, price = 1300)),
            FlameStatus.Out,
        )

        assertThat(GameGuideEvents.transitions(before, after).map { it.key }).containsExactly(
            GuideMomentKey.FirstLevel, GuideMomentKey.NewTier, GuideMomentKey.FirstMint, GuideMomentKey.PriceRises,
            GuideMomentKey.FlameOut,
        ).inOrder()
        assertThat(GameGuideEvents.nextTierLevel(LevelTierKey.Lueur)).isEqualTo(20)
        assertThat(GameGuideEvents.nextTierLevel(LevelTierKey.Singularite)).isNull()
    }

    @Test
    fun `un moment inedit passe devant un moment vu, et sans inedit le plus important revient en court`() {
        val events = listOf(
            GuideAnyEvent.Original(GuideEvent.FirstLevel(2, 10)),
            GuideAnyEvent.Original(GuideEvent.NewRank(GloryRank.Echo, 5, 100, 50)),
        )

        assertThat(GameGuideV2.chooseMoment(events, emptySet())).isEqualTo(
            GuideAnyMoment.Original(
                GuideMoment(GuideMomentKey.NewRank, GuideSpeaker.Duo, GuideMood.Proud, events[1].let { (it as GuideAnyEvent.Original).event }, GuideAction.TakePhoto, GuidePresentation.Full),
            ),
        )
        val unseen = GameGuideV2.chooseMoment(events, setOf("new-rank")) as GuideAnyMoment.Original
        assertThat(unseen.moment.key).isEqualTo(GuideMomentKey.FirstLevel)
        val allSeen = GameGuideV2.chooseMoment(events, setOf("new-rank", "first-level")) as GuideAnyMoment.Original
        assertThat(allSeen.moment.key to allSeen.moment.presentation).isEqualTo(GuideMomentKey.NewRank to GuidePresentation.Short)
    }

    @Test
    fun `un trophee de la vague 2 passe devant le niveau 100`() {
        val chosen = GameGuideV2.chooseMoment(
            listOf(GuideAnyEvent.Original(GuideEvent.Level100(true)), GuideAnyEvent.Wave2(GuideEventV2.Trophy("trophy.prestige.1"))),
            emptySet(),
        )

        assertThat((chosen as GuideAnyMoment.Wave2).moment.action).isEqualTo(GuideActionV2.SeeTrophies)
    }

    @Test
    fun `entre deux instantanes, la montee de la semaine, le trophee, la fin et le debut d'un voyage`() {
        val before = GuideSnapshot(
            prestige = 0,
            league = GuideSnapshot.League("2026-10-12", GuideSnapshot.League.Current(LeagueKey.Jade, 3, 0)),
            season = GuideSnapshot.Season(1, "language:sw", 40, completed = true),
            trophies = emptyList(),
            atlas = GuideSnapshot.Atlas(30, listOf("fr")),
        )
        val after = before.copy(
            prestige = 1,
            league = GuideSnapshot.League("2026-10-19", GuideSnapshot.League.Current(LeagueKey.Saphir, 20, 80)),
            season = GuideSnapshot.Season(2, "language:ja", 0, completed = false),
            trophies = listOf("trophy.season-cup.1"),
            atlas = GuideSnapshot.Atlas(30, listOf("fr", "en")),
        )

        assertThat(GameGuideEventsV2.between(before, after)).containsExactly(
            GuideEventV2.LeaguePromoted(LeagueKey.Jade, LeagueKey.Saphir, 3, "2026-10-12"),
            GuideEventV2.SeasonEnd(1, 40, true, 5000),
            GuideEventV2.SeasonStart(2, "language:ja", 40),
            GuideEventV2.Trophy("trophy.season-cup.1"),
            GuideEventV2.Prestige(1, 10_000),
            GuideEventV2.AtlasStamp("en", 2, 30),
        ).inOrder()
        assertThat(GameGuideEventsV2.between(before.copy(trophies = null, atlas = null), after).map { it.key })
            .containsNoneOf(GuideMomentKeyV2.Trophy, GuideMomentKeyV2.AtlasStamp)
    }

    @Test
    fun `chaque bouton mene a la fiche de son concept, aux conversations ou a la photo`() {
        assertThat(GameGuideCards.destination(GuideAction.EarnFirstPoints)).isEqualTo(GuideDestination.Conversations)
        assertThat(GameGuideCards.destination(GuideAction.KeepOrSpend)).isEqualTo(GuideDestination.Concept(ProgressionConcept.Meesh))
        assertThat(GameGuideCards.destination(GuideAction.MintOrClimb)).isEqualTo(GuideDestination.Concept(ProgressionConcept.Meesh))
        assertThat(GameGuideCards.destination(GuideAction.RelightFlame)).isEqualTo(GuideDestination.Concept(ProgressionConcept.Flame))
        assertThat(GameGuideCards.destination(GuideAction.SeeRank)).isEqualTo(GuideDestination.Concept(ProgressionConcept.Glory))
        assertThat(GameGuideCards.destination(GuideAction.DoEasiestMission)).isEqualTo(GuideDestination.Concept(ProgressionConcept.Missions))
        assertThat(GameGuideCards.destination(GuideAction.PrestigeOrStay)).isEqualTo(GuideDestination.Concept(ProgressionConcept.Level))
        assertThat(GameGuideCards.destination(GuideAction.TakePhoto)).isEqualTo(GuideDestination.Photo)
        assertThat(GameGuideCards.concept(GuideActionV2.SeeLevel)).isEqualTo(ProgressionConcept.Level)
        assertThat(GameGuideCards.concept(GuideActionV2.SeeTrophies)).isEqualTo(ProgressionConcept.Showcase)
    }

    @Test
    fun `la carte d'une etape dit sa place, celle d'un rang se photographie`() {
        val step = GameGuideCards.of(OnboardingStepKey.Missions)
        val rank = GameGuideCards.of(GameGuide.moment(GuideEvent.TreasuryTier(TreasuryTierKey.Bourse, 9), emptySet()))
        val stamp = GameGuideCards.of(GameGuideV2.moment(GuideEventV2.AtlasStamp("en", 1, 30), emptySet()))

        assertThat(step.key).isEqualTo("onboarding.missions")
        assertThat(step.step).isEqualTo(GuideCard.Position(4, 7))
        assertThat(step.destination).isEqualTo(GuideDestination.Concept(ProgressionConcept.Flame))
        assertThat(rank.photo).isTrue()
        assertThat(stamp.photo).isFalse()
        assertThat(stamp.destination).isEqualTo(GuideDestination.Concept(ProgressionConcept.Atlas))
    }
}
