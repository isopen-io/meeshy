package me.meeshy.app.game.progression

import android.content.Context
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import me.meeshy.feature.game.R
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Les portes du bas de la première page (iOS `ProgressionFrontList`) : « Comment ça marche » ouvre le carnet des règles,
 * « Réglages » les réglages du jeu, dans des lignes de la même forme. Sans bloc de jeu (serveur antérieur), le carnet ne
 * s'offre pas.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ProgressionDoorsComposeTest {

    @get:Rule val compose = createComposeRule()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    @Test
    fun `comment ca marche ouvre le carnet des regles`() {
        var rules = 0
        var settings = 0
        compose.setContent {
            MeeshyTheme { ProgressionDoors(hasGame = true, onOpenRules = { rules++ }, onOpenSettings = { settings++ }) }
        }

        compose.onNodeWithText(context.getString(R.string.game_door_rules)).assertHasClickAction().performClick()

        compose.runOnIdle {
            check(rules == 1) { "« Comment ça marche » n'a pas ouvert le carnet" }
            check(settings == 0) { "« Comment ça marche » a ouvert les réglages" }
        }
    }

    @Test
    fun `reglages reste la derniere porte et ouvre les reglages du jeu`() {
        var settings = 0
        compose.setContent {
            MeeshyTheme { ProgressionDoors(hasGame = true, onOpenRules = {}, onOpenSettings = { settings++ }) }
        }

        compose.onNodeWithText(context.getString(R.string.game2_door_settings)).performClick()

        compose.runOnIdle { check(settings == 1) { "« Réglages » n'a rien ouvert" } }
    }

    @Test
    fun `sans bloc de jeu le carnet ne s offre pas`() {
        compose.setContent {
            MeeshyTheme { ProgressionDoors(hasGame = false, onOpenRules = {}, onOpenSettings = {}) }
        }

        compose.onNodeWithText(context.getString(R.string.game_door_rules)).assertDoesNotExist()
        compose.onNodeWithText(context.getString(R.string.game2_door_settings)).assertExists()
    }
}
