package me.meeshy.ui.modifier

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.down
import androidx.compose.ui.test.up
import androidx.compose.ui.test.click
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ReactionPaletteTriggerGestureTest {

    @get:Rule
    val compose = createComposeRule()

    private var opened = 0
    private var hearts = 0

    private fun setContent() = compose.setContent {
        Box(
            Modifier
                .size(48.dp)
                .testTag("heart")
                .reactionPaletteTrigger(onOpen = { opened++ })
                .clickable { hearts++ },
        )
    }

    @Test
    fun aLongPressOpensThePaletteWithoutSendingTheHeart() {
        setContent()
        compose.onNodeWithTag("heart").performTouchInput { down(center) }
        compose.mainClock.advanceTimeBy(600)
        compose.onNodeWithTag("heart").performTouchInput { up() }
        compose.waitForIdle()

        assertThat(opened).isEqualTo(1)
        assertThat(hearts).isEqualTo(0)
    }

    @Test
    fun aBriefTapStillSendsTheHeartAndLeavesThePaletteClosed() {
        setContent()
        compose.onNodeWithTag("heart").performTouchInput { click() }
        compose.waitForIdle()

        assertThat(hearts).isEqualTo(1)
        assertThat(opened).isEqualTo(0)
    }
}
