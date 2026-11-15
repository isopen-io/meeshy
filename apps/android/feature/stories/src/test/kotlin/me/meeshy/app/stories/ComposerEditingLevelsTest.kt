package me.meeshy.app.stories

import androidx.activity.ComponentActivity
import androidx.compose.foundation.clickable
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * La colonne en édition se bâtit niveau après niveau (#13956, grammaire d'édition #13973) : un niveau plus fin se pose à
 * la place du précédent, Retour — le sien ou celui du système — descend d'un seul niveau, et le premier n'a pas de Retour.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ComposerEditingLevelsTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private enum class Level { OPTIONS, LOOK, FILTER }

    private fun show() {
        compose.setContent {
            MeeshyTheme {
                val levels = rememberEditingLevels(Level.OPTIONS, key = "sticker", backEnabled = true)
                EditingRailLevels(levels, back = { SceneLevelBack(it) }) { level ->
                    when (level) {
                        Level.OPTIONS -> Text("Look", modifier = Modifier.clickable { levels.onPush(Level.LOOK) })
                        Level.LOOK -> Text("Filter", modifier = Modifier.clickable { levels.onPush(Level.FILTER) })
                        Level.FILTER -> Text("Warm")
                    }
                }
            }
        }
    }

    @Test
    fun `the first level has no back, a finer level takes its place with one`() {
        show()
        compose.onNodeWithText("Back").assertDoesNotExist()

        compose.onNodeWithText("Look").performClick()

        compose.onNodeWithText("Filter").assertExists()
        compose.onNodeWithText("Look").assertDoesNotExist()
        compose.onNodeWithText("Back").assertExists()
    }

    @Test
    fun `back goes down one level, then the first level shows without back`() {
        show()
        compose.onNodeWithText("Look").performClick()
        compose.onNodeWithText("Filter").performClick()
        compose.onNodeWithText("Warm").assertExists()

        compose.onNodeWithText("Back").performClick()
        compose.onNodeWithText("Filter").assertExists()
        compose.onNodeWithText("Warm").assertDoesNotExist()

        compose.onNodeWithText("Back").performClick()
        compose.onNodeWithText("Look").assertExists()
        compose.onNodeWithText("Back").assertDoesNotExist()
    }

    @Test
    fun `the system back goes down one level before anything else`() {
        show()
        compose.onNodeWithText("Look").performClick()
        compose.onNodeWithText("Filter").assertExists()

        compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()

        compose.onNodeWithText("Look").assertExists()
        compose.onNodeWithText("Back").assertDoesNotExist()
    }
}
