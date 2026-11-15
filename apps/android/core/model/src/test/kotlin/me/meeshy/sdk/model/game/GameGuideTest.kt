package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.guide.GameGuide
import me.meeshy.sdk.model.game.guide.GameGuideV2
import me.meeshy.sdk.model.game.guide.GuideAction
import me.meeshy.sdk.model.game.guide.GuideAnyEvent
import me.meeshy.sdk.model.game.guide.GuideAnyMoment
import me.meeshy.sdk.model.game.guide.GuideEvent
import me.meeshy.sdk.model.game.guide.GuideMomentKey
import me.meeshy.sdk.model.game.guide.GuidePresentation
import me.meeshy.sdk.model.game.rules.GuideMood
import me.meeshy.sdk.model.game.rules.GuideSpeaker
import me.meeshy.sdk.model.game.rules.OnboardingStepKey
import org.junit.Test

class GameGuideTest {

    private fun original(vararg events: GuideEvent) = events.map { GuideAnyEvent.Original(it) }

    private fun choose(events: List<GuideAnyEvent>, seen: Set<String> = emptySet()) =
        (GameGuideV2.chooseMoment(events, seen) as GuideAnyMoment.Original?)?.moment

    @Test
    fun `un nouveau rang passe devant la Flamme menacee`() {
        val moment = choose(original(GuideEvent.FlameAtRisk(12), GuideEvent.NewRank(GloryRank.Voix, 2, 2200, 634)))!!

        assertThat(moment.key).isEqualTo(GuideMomentKey.NewRank)
        assertThat(moment.speaker).isEqualTo(GuideSpeaker.Duo)
        assertThat(moment.mood).isEqualTo(GuideMood.Proud)
        assertThat(moment.action).isEqualTo(GuideAction.TakePhoto)
        assertThat(moment.presentation).isEqualTo(GuidePresentation.Full)
    }

    @Test
    fun `une cle deja vue cede la carte a un moment inedit de moindre priorite`() {
        val events = original(GuideEvent.Level100(true), GuideEvent.MissionsUnlocked)

        assertThat(choose(events, setOf("level-100"))!!.key).isEqualTo(GuideMomentKey.MissionsUnlocked)
    }

    @Test
    fun `quand tout est vu le plus important revient en version courte`() {
        val moment = choose(original(GuideEvent.FirstMint), setOf("first-mint"))!!

        assertThat(moment.presentation).isEqualTo(GuidePresentation.Short)
    }

    @Test
    fun `aucun evenement ne donne aucune carte`() {
        assertThat(GameGuideV2.chooseMoment(emptyList(), emptySet())).isNull()
    }

    @Test
    fun `l'integration enchaine les sept etapes dans l'ordre`() {
        val seen = mutableSetOf<String>()
        val order = generateSequence { GameGuide.nextOnboardingStep(seen)?.also { seen += GameGuide.onboardingSeenKey(it.key) } }
            .map { it.key }.toList()

        assertThat(order).containsExactlyElementsIn(OnboardingStepKey.entries).inOrder()
        assertThat(GameGuide.nextOnboardingStep(seen)).isNull()
    }

    @Test
    fun `l'etape d'apres saute les etapes deja vues`() {
        val seen = setOf("onboarding.welcome", "onboarding.levels")

        assertThat(GameGuide.nextOnboardingStep(seen)!!.key).isEqualTo(OnboardingStepKey.FirstPoints)
        assertThat(GameGuide.action(OnboardingStepKey.Rank)).isEqualTo(GuideAction.TakeStartPhoto)
    }
}
