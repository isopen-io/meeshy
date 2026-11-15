package me.meeshy.app.game

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import me.meeshy.sdk.model.game.GameStaggeredEntranceLaw
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class GameStaggeredEntranceTest {

    @get:Rule val compose = createComposeRule()

    @Test
    fun `les delais montent de quatre centiemes et plafonnent a quatre dixiemes`() {
        val delays = (0..12).map { GameStaggeredEntranceLaw.delayMillis(it) }
        assertEquals(listOf(0, 40, 80, 120, 160, 200, 240, 280, 320, 360, 400, 400, 400), delays)
    }

    @Test
    fun `une page deja entree ne rejoue rien`() {
        assertEquals(false, GameStaggeredEntranceLaw.plays(entered = true, reduceMotion = false))
    }

    @Test
    fun `le mouvement reduit pose la carte sans entree`() {
        assertEquals(false, GameStaggeredEntranceLaw.plays(entered = false, reduceMotion = true))
    }

    @Test
    fun `la carte reste affichee avant puis apres l entree`() {
        var entered by mutableStateOf(false)
        compose.setContent {
            Column { Text("carte", Modifier.gameStaggeredEntrance(index = 3, entered = entered)) }
        }
        compose.onNodeWithText("carte").assertIsDisplayed()
        entered = true
        compose.waitForIdle()
        compose.onNodeWithText("carte").assertIsDisplayed()
    }

    private fun assertEquals(expected: Any?, actual: Any?) = check(expected == actual) { "attendu $expected, obtenu $actual" }
}
