package me.meeshy.app.stories

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.doubleClick
import androidx.compose.ui.test.performTouchInput
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.AdjustmentFamily
import me.meeshy.sdk.model.AdjustmentKind
import me.meeshy.sdk.model.ImageAdjustments
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #13652 : comme iOS (`ComposerMediaAdjustPanel`), UN réglage à la fois — un seul curseur, sa valeur lue de −100 à +100 —,
 * « Comparer » à l'appui maintenu et « Réinitialiser » seulement quand le média porte un rendu.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ComposerImageAdjustmentsPanelTest {
    @get:Rule
    val compose = createComposeRule()

    private val tuned = ImageAdjustments().with(AdjustmentKind.CONTRAST, 1.25f)

    private class Probe {
        val adjusted = mutableListOf<Pair<AdjustmentKind, Float>>()
        val compare = mutableListOf<Boolean>()
        var resets = 0
    }

    private fun show(
        adjustments: ImageAdjustments = ImageAdjustments.NEUTRAL,
        family: AdjustmentFamily = AdjustmentFamily.TONE,
        isVideo: Boolean = false,
        carriesLook: Boolean = true,
        canCompare: Boolean = true,
        probe: Probe = Probe(),
    ): Probe {
        compose.setContent {
            MeeshyTheme {
                var current by remember { mutableStateOf(adjustments) }
                ComposerImageAdjustmentsPanel(
                    adjustments = current,
                    isVideo = isVideo,
                    family = family,
                    accent = Color.Magenta,
                    carriesLook = carriesLook,
                    onAdjust = { kind, value -> probe.adjusted += kind to value; current = current.with(kind, value) },
                    onReset = { probe.resets++; current = current.resetting(family) },
                    onCompare = if (canCompare) { holding -> probe.compare += holding } else null,
                )
            }
        }
        return probe
    }

    @Test
    fun `un seul curseur est montre, celui du premier reglage, et sa valeur se lit au neutre`() {
        show()

        compose.onNodeWithTag("adjust-slider").assertIsDisplayed()
        compose.onNodeWithTag("adjust-value").assertTextEquals("0")
        AdjustmentKind.entries.filter { it.family == AdjustmentFamily.TONE }.forEach {
            compose.onNodeWithTag("adjust-kind-${it.wireName}").assertExists()
        }
    }

    @Test
    fun `toucher un reglage de la rangee pilote le curseur unique avec sa valeur signee`() {
        show(adjustments = tuned)

        compose.onNodeWithTag("adjust-kind-contrast").performClick()

        compose.onNodeWithTag("adjust-value").assertTextEquals("+50")
    }

    @Test
    fun `les Effets n offrent que bloom et grain, une video aucun effet`() {
        show(family = AdjustmentFamily.EFFECT)
        compose.onNodeWithTag("adjust-kind-bloom").assertIsDisplayed()
        compose.onNodeWithTag("adjust-kind-grain").assertIsDisplayed()
        compose.onNodeWithTag("adjust-kind-exposure").assertDoesNotExist()
    }

    @Test
    fun `une video ne propose ni nettete ni flou`() {
        show(isVideo = true)
        compose.onNodeWithTag("adjust-kind-contrast").assertIsDisplayed()
        compose.onNodeWithTag("adjust-kind-blur").assertDoesNotExist()
        compose.onNodeWithTag("adjust-kind-sharpness").assertDoesNotExist()
    }

    @Test
    fun `Comparer et Reinitialiser ne se peignent que si le media porte un rendu`() {
        show(carriesLook = false, adjustments = tuned)
        compose.onNodeWithTag("adjust-compare").assertDoesNotExist()
        compose.onNodeWithTag("adjust-reset").assertDoesNotExist()
    }

    @Test
    fun `Reinitialiser n apparait que si ce sous-outil a quelque chose a remettre`() {
        show(carriesLook = true, adjustments = ImageAdjustments.NEUTRAL)
        compose.onNodeWithTag("adjust-reset").assertDoesNotExist()
        compose.onNodeWithTag("adjust-compare").assertIsDisplayed()
    }

    @Test
    fun `Reinitialiser remet le sous-outil au neutre`() {
        val probe = show(adjustments = tuned)

        compose.onNodeWithTag("adjust-reset").performClick()

        assertThat(probe.resets).isEqualTo(1)
        compose.onNodeWithTag("adjust-reset").assertDoesNotExist()
    }

    @Test
    fun `la surface qui ne sait pas montrer l original n offre pas Comparer`() {
        show(adjustments = tuned, canCompare = false)
        compose.onNodeWithTag("adjust-compare").assertDoesNotExist()
        compose.onNodeWithTag("adjust-reset").assertIsDisplayed()
    }

    @Test
    fun `maintenir Comparer montre l original, le relacher rend le rendu`() {
        val probe = show(adjustments = tuned)

        compose.onNodeWithTag("adjust-compare").performTouchInput { down(center) }
        assertThat(probe.compare).containsExactly(true)
        compose.onNodeWithTag("adjust-compare").performTouchInput { up() }

        assertThat(probe.compare).containsExactly(true, false).inOrder()
    }

    @Test
    fun `toucher deux fois la valeur remet le reglage choisi au neutre`() {
        val probe = show(adjustments = tuned)
        compose.onNodeWithTag("adjust-kind-contrast").performClick()

        compose.onNodeWithTag("adjust-value").performTouchInput { doubleClick() }

        assertThat(probe.adjusted.last()).isEqualTo(AdjustmentKind.CONTRAST to AdjustmentKind.CONTRAST.neutral)
    }

}
