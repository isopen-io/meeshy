package me.meeshy.app.calls

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallChromeStow
import me.meeshy.ui.accessibility.LocalReduceMotion
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** #20299 — [CallChromeFade] is THE rule that decides whether the stowed call chrome still catches a touch. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallChromeFadeTouchTest {
    @get:Rule val rule = createComposeRule()

    private class Taps {
        var button = 0
        var stage = 0
        var revives = 0
    }

    private var isVisible by mutableStateOf(true)

    private fun mount(reduceMotion: Boolean = false): Taps {
        val taps = Taps()
        rule.setContent {
            CompositionLocalProvider(LocalReduceMotion provides reduceMotion) {
                Box(Modifier.fillMaxSize().testTag(STAGE).clickable { taps.stage++ }) {
                    CallChromeFade(
                        isVisible = isVisible,
                        onRevive = { taps.revives++ },
                        modifier = Modifier.align(Alignment.Center),
                    ) {
                        Box(Modifier.size(80.dp).testTag(BUTTON).clickable { taps.button++ })
                    }
                }
            }
        }
        rule.waitForIdle()
        rule.mainClock.autoAdvance = false
        return taps
    }

    private fun stow() {
        rule.runOnUiThread { isVisible = false }
        rule.mainClock.advanceTimeByFrame()
    }

    @Test
    fun `visible, a tap on the chrome reaches its button`() {
        val taps = mount()

        rule.onNodeWithTag(BUTTON).performClick()

        assertThat(taps.button).isEqualTo(1)
        assertThat(taps.stage).isEqualTo(0)
        assertThat(taps.revives).isEqualTo(0)
    }

    @Test
    fun `a tap during the fade relights the chrome and still reaches the button under the finger`() {
        val taps = mount()
        stow()
        rule.mainClock.advanceTimeBy(DURING_FADE_MILLIS)

        rule.onNodeWithTag(BUTTON).performClick()

        assertThat(taps.revives).isEqualTo(1)
        assertThat(taps.button).isEqualTo(1)
        assertThat(taps.stage).isEqualTo(0)
    }

    @Test
    fun `once the fade is over the chrome is gone, a tap there reaches the stage and relights nothing`() {
        val taps = mount()
        stow()
        rule.mainClock.advanceTimeBy(CallChromeStow.fadeMillis(reduceMotion = false) + SETTLE_MILLIS)

        rule.onNodeWithTag(BUTTON).assertDoesNotExist()
        rule.onNodeWithTag(STAGE).performClick()

        assertThat(taps.stage).isEqualTo(1)
        assertThat(taps.revives).isEqualTo(0)
        assertThat(taps.button).isEqualTo(0)
    }

    @Test
    fun `without reduce motion the chrome is still there when the reduced fade would be over`() {
        mount(reduceMotion = false)
        stow()
        rule.mainClock.advanceTimeBy(CallChromeStow.REDUCED_FADE_MILLIS + SETTLE_MILLIS)

        rule.onNodeWithTag(BUTTON).assertExists()
    }

    @Test
    fun `under reduce motion the chrome leaves after the short fade`() {
        val taps = mount(reduceMotion = true)
        stow()
        rule.mainClock.advanceTimeBy(CallChromeStow.REDUCED_FADE_MILLIS + SETTLE_MILLIS)

        rule.onNodeWithTag(BUTTON).assertDoesNotExist()
        rule.onNodeWithTag(STAGE).performClick()
        assertThat(taps.stage).isEqualTo(1)
        assertThat(taps.revives).isEqualTo(0)
    }

    private companion object {
        const val STAGE = "stage"
        const val BUTTON = "chrome-button"
        const val DURING_FADE_MILLIS = 50L
        const val SETTLE_MILLIS = 60L
    }
}
