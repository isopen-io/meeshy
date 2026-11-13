package me.meeshy.app.calls

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallFaceEffect
import me.meeshy.sdk.model.call.VideoFilterConfig
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.effects.CallEffectKind
import me.meeshy.sdk.model.call.effects.CallEffectsBarMode
import me.meeshy.sdk.model.call.effects.CallEffectsCategory
import me.meeshy.sdk.model.call.effects.CallEffectsGenreRule
import me.meeshy.sdk.model.call.effects.CallEffectsModeState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #17902 · #16979 — « effets, filtres et cadres font partie d'une même famille d'outils » : en Effets, la rangée de genres
 * est celle du Montage (Visage · Couleur · Cadres, comme iOS `CallEffectsGenreChips`). « Cadres » ouvre le Montage, et (+)
 * l'ouvre aussi quand Visage et Couleur sont déjà posés ; sans Montage offert, « Cadres » n'y est pas.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallEffectsGenreRowTest {
    @get:Rule val rule = createComposeRule()

    private class Outcome {
        var frames = 0
        var mode by mutableStateOf(CallEffectsModeState.opening(VideoFilterConfig()))
    }

    private fun show(outcome: Outcome, offersFrames: Boolean = true) {
        val row = CallEffectsGenreRule.row(offersEffects = true, offersFrames = offersFrames)
        rule.setContent {
            MeeshyTheme {
                EffectsModeBar(
                    mode = outcome.mode,
                    row = row,
                    reduceMotion = true,
                    onChange = { outcome.mode = it },
                    onFinish = {},
                    onOpenFrames = { outcome.frames++ },
                )
            }
        }
    }

    @Test
    fun `la rangee porte Visage, Couleur et Cadres, Visage presse`() {
        show(Outcome())

        rule.onNodeWithText("Face").assert(SemanticsMatcher.expectValue(SemanticsProperties.Selected, true))
        rule.onNodeWithText("Colour").assert(SemanticsMatcher.expectValue(SemanticsProperties.Selected, false))
        rule.onNodeWithText("Frames").assert(SemanticsMatcher.expectValue(SemanticsProperties.Selected, false))
    }

    @Test
    fun `toucher Cadres ouvre le Montage, toucher Couleur montre les couleurs ici`() {
        val outcome = Outcome()
        show(outcome)

        rule.onNodeWithText("Frames").performClick()
        rule.onNodeWithText("Colour").performClick()
        rule.waitForIdle()

        assertThat(outcome.frames).isEqualTo(1)
        assertThat(outcome.mode.category).isEqualTo(CallEffectsCategory.Color)
    }

    @Test
    fun `sans Montage offert la rangee n'a pas Cadres`() {
        show(Outcome(), offersFrames = false)

        rule.onNodeWithText("Frames").assertDoesNotExist()
        rule.onNodeWithText("Face").assertExists()
    }

    @Test
    fun `(+) ouvre d'abord l'autre genre d'Effets et rend le menu de base`() {
        val outcome = Outcome().apply { mode = mode.selecting(CallFaceEffect.Toad).togglingSettings() }
        show(outcome)

        rule.onNodeWithContentDescription("Add another look").performClick()
        rule.waitForIdle()

        assertThat(outcome.mode.category).isEqualTo(CallEffectsCategory.Color)
        assertThat(outcome.mode.bar).isEqualTo(CallEffectsBarMode.Base)
        assertThat(outcome.frames).isEqualTo(0)
    }

    @Test
    fun `(+) avec Visage et Couleur poses ouvre le Montage`() {
        val outcome = Outcome().apply { mode = mode.selecting(CallFaceEffect.Toad).selecting(VideoFilterPreset.Golden) }
        show(outcome)

        rule.onNodeWithContentDescription("Add another look").performClick()

        assertThat(outcome.frames).isEqualTo(1)
        assertThat(outcome.mode.layers.kinds).containsExactly(CallEffectKind.Face, CallEffectKind.Color)
    }

    @Test
    fun `sans Montage, Visage et Couleur poses, (+) laisse feuilleter l'autre genre`() {
        val outcome = Outcome().apply { mode = mode.selecting(CallFaceEffect.Toad).selecting(VideoFilterPreset.Golden) }
        show(outcome, offersFrames = false)

        rule.onNodeWithContentDescription("Add another look").performClick()
        rule.waitForIdle()

        assertThat(outcome.frames).isEqualTo(0)
        assertThat(outcome.mode.category).isEqualTo(CallEffectsCategory.Color)
    }
}
