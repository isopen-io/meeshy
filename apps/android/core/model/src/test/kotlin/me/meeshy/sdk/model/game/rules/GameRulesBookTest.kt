package me.meeshy.sdk.model.game.rules

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import org.junit.Test

class GameRulesBookTest {

    @Test
    fun `the book tells eight rules numbered one to eight`() {
        assertThat(GameRulesBook.ruleIndices).containsExactly(1, 2, 3, 4, 5, 6, 7, 8).inOrder()
    }

    @Test
    fun `the glossary lists every progression concept, each followed by what completes it`() {
        assertThat(GameRulesBook.glossary.map { it.wire }).containsExactly(
            "level", "steps", "points", "meesh", "treasury", "glory", "flame", "missions", "chest", "league",
            "season", "duo", "prestige", "elans", "tailwind", "badges", "defis", "succes", "showcase", "atlas",
        ).inOrder()
        assertThat(GameRulesBook.glossary.filterIsInstance<GlossaryKey.Concept>().map { it.concept })
            .containsExactlyElementsIn(ProgressionConcept.entries).inOrder()
    }

    @Test
    fun `the seven onboarding steps keep iOS speakers and moods`() {
        assertThat(GameRulesBook.onboardingSteps.map { Triple(it.key.wire, it.speaker, it.mood) }).containsExactly(
            Triple("welcome", GuideSpeaker.Mee, GuideMood.Guide),
            Triple("first-points", GuideSpeaker.Mee, GuideMood.Cheer),
            Triple("levels", GuideSpeaker.Meo, GuideMood.Guide),
            Triple("missions", GuideSpeaker.Mee, GuideMood.Ready),
            Triple("flame", GuideSpeaker.Meo, GuideMood.Calm),
            Triple("mint", GuideSpeaker.Duo, GuideMood.Minting),
            Triple("rank", GuideSpeaker.Meo, GuideMood.Guide),
        ).inOrder()
        assertThat(GameRulesBook.onboardingSteps.map { it.index }).containsExactly(1, 2, 3, 4, 5, 6, 7).inOrder()
    }

    @Test
    fun `a step shows the films of its speaker in its mood`() {
        assertThat(GuideFilms.of(GuideSpeaker.Mee, GuideMood.Cheer)).isEqualTo(GuideFilms(mee = "mee-fete", meo = null))
        assertThat(GuideFilms.of(GuideSpeaker.Meo, GuideMood.Calm)).isEqualTo(GuideFilms(mee = null, meo = "meo-ok"))
        assertThat(GuideFilms.of(GuideSpeaker.Duo, GuideMood.Minting)).isEqualTo(GuideFilms(mee = "mee-jackpot", meo = "meo-muscles"))
        assertThat(GuideMood.entries.map { GuideFilms.of(GuideSpeaker.Duo, it) }.map { it.mee to it.meo }).containsExactly(
            "mee-bonjour" to "meo-salut", "mee-fete" to "meo-bravo", "mee-jackpot" to "meo-muscles",
            "mee-coucou" to "meo-clin", "mee-danse" to "meo-feu-artifice", "mee-je-reflechis" to "meo-hmm",
            "mee-sourire" to "meo-ok", "mee-pleure" to "meo-effondre", "mee-bravo" to "meo-roi",
        ).inOrder()
    }
}
