package me.meeshy.sdk.model.game.progression

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.pages.GamePage
import org.junit.Test

class ProgressionConceptLinkTest {

    @Test
    fun `les sept concepts du jeu de base n ont pas de sous-page`() {
        listOf(
            ProgressionConcept.Level, ProgressionConcept.Points, ProgressionConcept.Meesh, ProgressionConcept.Glory,
            ProgressionConcept.Flame, ProgressionConcept.Missions, ProgressionConcept.Elans,
        ).forEach { assertThat(ProgressionConceptLinks.of(it)).isEmpty() }
    }

    @Test
    fun `chaque concept etendu mene a sa seule sous-page`() {
        assertThat(ProgressionConceptLinks.of(ProgressionConcept.League)).containsExactly(ProgressionConceptLink.Page(GamePage.League))
        assertThat(ProgressionConceptLinks.of(ProgressionConcept.Atlas)).containsExactly(ProgressionConceptLink.Page(GamePage.Atlas))
        assertThat(ProgressionConceptLinks.of(ProgressionConcept.Badges)).containsExactly(ProgressionConceptLink.Section(ProgressionConcept.Badges))
        assertThat(ProgressionConceptLinks.of(ProgressionConcept.Succes).single().id).isEqualTo("section.succes")
    }
}
