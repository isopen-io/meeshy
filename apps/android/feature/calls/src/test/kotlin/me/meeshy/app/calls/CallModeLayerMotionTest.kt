package me.meeshy.app.calls

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallScreenMode
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #17814 · C1.12 — la couche d'un mode, observée image par image : la barre du Montage monte du bas et y redescend,
 * la couche ne disparaît qu'au bout de son fondu, et « Réduire les animations » comme Effets ne déplacent rien.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallModeLayerMotionTest {
    @get:Rule val rule = createComposeRule()

    private fun layer(mode: CallScreenMode, reduceMotion: Boolean, initiallyShown: Boolean): MutableState<Boolean> {
        val shown = mutableStateOf(initiallyShown)
        rule.setContent {
            Box(Modifier.size(400.dp)) {
                CallModeLayer(visible = shown.value, mode = mode, reduceMotion = reduceMotion) { chrome ->
                    Box(Modifier.align(Alignment.BottomCenter).then(chrome).size(100.dp).testTag(BAR))
                }
            }
        }
        rule.mainClock.autoAdvance = false
        return shown
    }

    private fun barTop(): Float = rule.onNodeWithTag(BAR).getUnclippedBoundsInRoot().top.value

    private fun toggleAndReachMidway(shown: MutableState<Boolean>) {
        rule.runOnIdle { shown.value = !shown.value }
        rule.mainClock.advanceTimeByFrame()
        rule.mainClock.advanceTimeBy(MIDWAY_MILLIS)
    }

    @Test
    fun `C1_12 - la barre du Montage entre par le bas`() {
        val shown = layer(CallScreenMode.Montage, reduceMotion = false, initiallyShown = false)

        toggleAndReachMidway(shown)
        val midway = barTop()
        rule.mainClock.advanceTimeBy(SETTLED_MILLIS)

        assertThat(midway).isGreaterThan(barTop())
    }

    @Test
    fun `C1_12 - la barre du Montage repart vers le bas et la couche ne disparait qu'au bout du fondu`() {
        val shown = layer(CallScreenMode.Montage, reduceMotion = false, initiallyShown = true)
        val rest = barTop()

        toggleAndReachMidway(shown)

        assertThat(barTop()).isGreaterThan(rest)
        rule.mainClock.advanceTimeBy(SETTLED_MILLIS)
        rule.onNodeWithTag(BAR).assertDoesNotExist()
    }

    @Test
    fun `C1_12 - sous Reduire les animations le Montage ne se deplace pas, il fond`() {
        val shown = layer(CallScreenMode.Montage, reduceMotion = true, initiallyShown = true)
        val rest = barTop()

        toggleAndReachMidway(shown)

        rule.onNodeWithTag(BAR).assertExists()
        assertThat(barTop()).isEqualTo(rest)
        rule.mainClock.advanceTimeBy(SETTLED_MILLIS)
        rule.onNodeWithTag(BAR).assertDoesNotExist()
    }

    @Test
    fun `C1_12 - Effets ne monte pas du bas, sa couche fond seulement`() {
        val shown = layer(CallScreenMode.Effects, reduceMotion = false, initiallyShown = true)
        val rest = barTop()

        toggleAndReachMidway(shown)

        rule.onNodeWithTag(BAR).assertExists()
        assertThat(barTop()).isEqualTo(rest)
    }

    private companion object {
        const val BAR = "callModeChrome"
        const val MIDWAY_MILLIS = 64L
        const val SETTLED_MILLIS = 1_000L
    }
}
