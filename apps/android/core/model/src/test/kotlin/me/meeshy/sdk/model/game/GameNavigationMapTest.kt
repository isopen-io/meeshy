package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.deeplink.GameLink
import me.meeshy.sdk.model.game.guide.GuideActionV2
import me.meeshy.sdk.model.game.pages.GamePage
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import org.junit.Test

class GameNavigationMapTest {

    private val everyRoute: List<GameRoute> =
        listOf(GameRoute.Progression, GameRoute.Notebook, GameRoute.Rules(), GameNavigationMap.badgesGuide) +
            ProgressionConcept.entries.map { GameRoute.Concept(it) } +
            GamePage.entries.map { GameRoute.Page(it) } +
            listOf(ProgressionConcept.Badges, ProgressionConcept.Defis, ProgressionConcept.Succes).map { GameRoute.Section(it) }

    @Test
    fun `chaque route a un niveau entre un et trois et une chaine qui part de la premiere page`() {
        everyRoute.forEach { route ->
            assertThat(GameNavigationMap.level(route)).isIn(1..3)
            val chain = GameNavigationMap.chain(route)
            assertThat(chain.first()).isEqualTo(GameRoute.Progression)
            assertThat(chain.last()).isEqualTo(route)
            assertThat(chain).hasSize(GameNavigationMap.level(route))
        }
    }

    @Test
    fun `aucune route n est orpheline le retour monte d un niveau`() {
        everyRoute.filter { it != GameRoute.Progression }.forEach { route ->
            val parent = GameNavigationMap.parent(route)
            assertThat(parent).isNotNull()
            assertThat(GameNavigationMap.level(parent!!)).isEqualTo(GameNavigationMap.level(route) - 1)
        }
        assertThat(GameNavigationMap.parent(GameRoute.Progression)).isNull()
    }

    @Test
    fun `les portes de la premiere page et les reglages sont au deuxieme niveau`() {
        listOf(GameRoute.Notebook, GameRoute.Rules(), GameNavigationMap.badgesGuide, GameRoute.Page(GamePage.Settings))
            .forEach { assertThat(GameNavigationMap.level(it)).isEqualTo(2) }
    }

    @Test
    fun `une sous-page a pour parent la fiche de son concept`() {
        assertThat(GameNavigationMap.parent(GameRoute.Page(GamePage.League))).isEqualTo(GameRoute.Concept(ProgressionConcept.League))
        assertThat(GameNavigationMap.parent(GameRoute.Section(ProgressionConcept.Defis))).isEqualTo(GameRoute.Concept(ProgressionConcept.Defis))
    }

    @Test
    fun `une notification de ligue ouvre le classement posé au dessus de la fiche et de la première page`() {
        assertThat(GameNavigationMap.chain(GameNavigationMap.entry("game_league_result")!!)).containsExactly(
            GameRoute.Progression, GameRoute.Concept(ProgressionConcept.League), GameRoute.Page(GamePage.League),
        ).inOrder()
    }

    @Test
    fun `une notification de mission ouvre la fiche des missions a la section act`() {
        assertThat(GameNavigationMap.entry("game_mission_window"))
            .isEqualTo(GameRoute.Concept(ProgressionConcept.Missions, ConceptSection.Act))
    }

    @Test
    fun `les types hors du jeu n ouvrent rien`() {
        assertThat(GameNavigationMap.entry("new_message")).isNull()
    }

    @Test
    fun `un lien nomme la saison ou la semaine sinon l en cours`() {
        assertThat(GameNavigationMap.entry(GameLink.Season(4))).isEqualTo(GameRoute.Page(GamePage.Season, GamePageFocus.Season(4)))
        assertThat(GameNavigationMap.entry(GameLink.LeagueWeek(null))).isEqualTo(GameRoute.Page(GamePage.League, null))
    }

    @Test
    fun `le moment du prestige ouvre la fiche du niveau`() {
        assertThat(GameNavigationMap.guideConcept(GuideActionV2.SeeLevel)).isEqualTo(ProgressionConcept.Level)
        assertThat(GameNavigationMap.guideConcept(GuideActionV2.SeeAtlas)).isEqualTo(ProgressionConcept.Atlas)
    }
}
