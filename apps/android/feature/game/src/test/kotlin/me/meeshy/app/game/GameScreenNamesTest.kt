package me.meeshy.app.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameScreenNamesTest {
    private val names = GameScreenName.entries.map { it.analyticsName }

    @Test
    fun `chaque page a un nom prefixe Game point`() {
        assertThat(names).isNotEmpty()
        names.forEach { assertThat(it).startsWith("Game.") }
    }

    @Test
    fun `les noms sont uniques`() {
        assertThat(names).containsNoDuplicates()
    }

    @Test
    fun `les noms d analytics sont stables`() {
        assertThat(names).containsExactly(
            "Game.Progression", "Game.League", "Game.Season", "Game.Showcase", "Game.Atlas",
            "Game.Prestige", "Game.Settings", "Game.Rules", "Game.Notebook",
        ).inOrder()
    }
}
