package me.meeshy.app.calls

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.VideoFilterConfig
import me.meeshy.sdk.model.call.effects.CallEffectsCategory
import me.meeshy.sdk.model.call.effects.CallEffectsModeState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** P8b — la barre d'Effets parle la langue du composer : ‹ · Réglages · (+), sans Quitter ni Valider ; Réglages range les puces. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallEffectsSettingsBarTest {
    @get:Rule val rule = createComposeRule()

    private fun opening() = CallEffectsModeState.opening(VideoFilterConfig())

    @Test
    fun `la barre porte Retour, Reglages et Ajouter un look, et plus ni Quitter ni Valider (P8b_4, P8b_5)`() {
        var backs = 0
        var mode by mutableStateOf(opening())
        rule.setContent {
            MeeshyTheme {
                EffectsBar(
                    mode = mode,
                    reduceMotion = true,
                    onBack = { backs++ },
                    onSettings = { mode = mode.togglingSettings() },
                    onAddLook = { mode = mode.addingLook() },
                    onCategory = { mode = mode.showing(it) },
                )
            }
        }

        rule.onNodeWithContentDescription("Quit").assertDoesNotExist()
        rule.onNodeWithContentDescription("Apply").assertDoesNotExist()
        rule.onNodeWithContentDescription("Add another look").performClick()
        rule.runOnIdle { assertThat(mode.category).isEqualTo(CallEffectsCategory.Color) }
        rule.onNodeWithContentDescription("Back to the call").performClick()
        rule.runOnIdle { assertThat(backs).isEqualTo(1) }
    }

    @Test
    fun `Reglages retire les puces de la barre, et les rend au second toucher (P8b_6)`() {
        var mode by mutableStateOf(opening())
        rule.setContent {
            MeeshyTheme {
                EffectsBar(
                    mode = mode,
                    reduceMotion = true,
                    onBack = {},
                    onSettings = { mode = mode.togglingSettings() },
                    onAddLook = {},
                    onCategory = { mode = mode.showing(it) },
                )
            }
        }

        rule.onNodeWithText("Face").assertExists()
        rule.onNodeWithContentDescription("Settings").performClick()
        rule.waitForIdle()
        assertThat(mode.showsSettings).isTrue()
        rule.onNodeWithText("Face").assertDoesNotExist()

        rule.onNodeWithContentDescription("Settings").performClick()
        rule.waitForIdle()
        rule.onNodeWithText("Face").assertExists()
    }

    @Test
    fun `le panneau porte la luminosite et une ligne Flou du fond qui bascule toute entiere (P8b_3)`() {
        var mode by mutableStateOf(opening().togglingSettings())
        rule.setContent {
            MeeshyTheme { EffectsSettingsPanel(mode, onChange = { mode = it }) }
        }

        rule.onNodeWithContentDescription("Brightness").assertExists()
        assertThat(mode.current.backgroundBlurEnabled).isFalse()
        rule.onNodeWithText("Background blur").performClick()
        rule.runOnIdle { assertThat(mode.current.backgroundBlurEnabled).isTrue() }
    }
}
