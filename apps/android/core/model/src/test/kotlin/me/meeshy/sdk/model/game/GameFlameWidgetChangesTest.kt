package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.game.pages.GameDevicePrefs
import org.junit.Test

/**
 * « Ma Flamme » (#20566) se repeint seulement quand ce qu'il MONTRE change (iOS : `MenuActsRingStore` ne recharge le
 * widget que si le cliché change) — jamais sur une réécriture du bloc qui ne touche ni la Flamme ni les actes, ni sur
 * une préférence voisine.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class GameFlameWidgetChangesTest {

    private val base: GameBlock = checkNotNull(GameBlockParser.parse(GameBlockFixtures.block()))

    private fun game(days: Int, status: FlameStatus = FlameStatus.Lit): GameBlock =
        base.copy(flame = base.flame.copy(days = days, status = status))

    private class Inputs(game: GameBlock?) {
        val user = MutableStateFlow<String?>("u1")
        val prefs = MutableStateFlow(GameDevicePrefs())
        val cached = MutableStateFlow(game)
    }

    private fun TestScope.observe(inputs: Inputs): List<GameFlameWidgetState> {
        val seen = mutableListOf<GameFlameWidgetState>()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
            GameFlameWidgetFeed.changes(inputs.user, inputs.prefs, inputs.cached).toList(seen)
        }
        return seen
    }

    private fun shownDays(state: GameFlameWidgetState): Int = (state as GameFlameWidgetState.Shown).face.days

    @Test
    fun `une reecriture du bloc qui ne touche pas la face ne repeint pas, un jour de plus repeint`() = runTest {
        val inputs = Inputs(game(days = 4))
        val seen = observe(inputs)
        advanceUntilIdle()
        inputs.cached.value = game(days = 4).copy(guideSeen = listOf("moment:first-mint"))
        advanceUntilIdle()
        inputs.cached.value = game(days = 5)
        advanceUntilIdle()
        assertThat(seen.map(::shownDays)).containsExactly(4, 5).inOrder()
    }

    @Test
    fun `une preference voisine ne repeint pas, Jeu masque vide le widget`() = runTest {
        val inputs = Inputs(game(days = 4))
        val seen = observe(inputs)
        advanceUntilIdle()
        inputs.prefs.value = GameDevicePrefs(celebrations = false)
        advanceUntilIdle()
        inputs.prefs.value = GameDevicePrefs(hidden = true)
        advanceUntilIdle()
        assertThat(seen).hasSize(2)
        assertThat(seen.last()).isEqualTo(GameFlameWidgetState.Hidden)
    }

    @Test
    fun `la deconnexion ramene l'invitation, puis le cache vide ne repeint plus`() = runTest {
        val inputs = Inputs(game(days = 4, status = FlameStatus.AtRisk))
        val seen = observe(inputs)
        advanceUntilIdle()
        inputs.user.value = null
        advanceUntilIdle()
        inputs.cached.value = null
        advanceUntilIdle()
        assertThat(seen).hasSize(2)
        assertThat((seen.first() as GameFlameWidgetState.Shown).face.look).isEqualTo(GameFlameLook.AtRisk)
        assertThat(seen.last()).isEqualTo(GameFlameWidgetState.Shown(GameFlameWidgetFace.INVITE))
    }
}
