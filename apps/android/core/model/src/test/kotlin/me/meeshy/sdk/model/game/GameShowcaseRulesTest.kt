package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameShowcaseRulesTest {

    private fun block(items: List<String>, order: List<String>) =
        GameTrophiesBlock(items.map { GameTrophyItem(it, "2026-10-12T00:00:00.000Z") }, order)

    private fun visitor(visible: Boolean, items: List<GameVisitorTrophyItem>, order: List<String> = emptyList()) =
        UserShowcaseResponse(visible, items, order)

    @Test
    fun `l'ordre range par la personne est l'ordre parcouru, le reste suit dans l'ordre servi`() {
        val shelf = GameShowcaseRules.shelfOrder(block(listOf("a", "b", "c"), listOf("c", "inconnu", "c", "a")))
        assertThat(shelf).containsExactly("c", "a", "b").inOrder()
    }

    @Test
    fun `monter ou descendre d'un cran, et rien au bord de la vitrine`() {
        val order = listOf("a", "b", "c")
        assertThat(GameShowcaseRules.moved(order, 1, -1)).containsExactly("b", "a", "c").inOrder()
        assertThat(GameShowcaseRules.moved(order, 2, 1)).isEqualTo(order)
        assertThat(GameShowcaseRules.moved(order, 0, -1)).isEqualTo(order)
        assertThat(GameShowcaseRules.moved(order, 5, -1)).isEqualTo(order)
    }

    @Test
    fun `une vitrine fermee ou absente ne rend rien`() {
        val item = GameVisitorTrophyItem("trophy.prestige.1", "2026-10")
        assertThat(GameVisitorShowcase.entries(null)).isEmpty()
        assertThat(GameVisitorShowcase.entries(visitor(false, listOf(item)))).isEmpty()
    }

    @Test
    fun `le visiteur lit le mois seul et ne nomme pas une cle d'une version plus recente`() {
        val items = listOf(
            GameVisitorTrophyItem("trophy.flame.100", "2026-09"),
            GameVisitorTrophyItem("trophy.futur.7", "2026-10"),
            GameVisitorTrophyItem("trophy.prestige.1", "2026-11", count = 2),
        )
        val entries = GameVisitorShowcase.entries(visitor(true, items, order = listOf("trophy.prestige.1")))
        assertThat(entries.map { it.key }).containsExactly("trophy.prestige.1", "trophy.flame.100").inOrder()
        assertThat(entries.first().awardedMonth).isEqualTo("2026-11")
        assertThat(entries.first().count).isEqualTo(2)
    }
}
