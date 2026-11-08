package me.meeshy.ui.component.imageedit

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.center
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.moveBy
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.up
import androidx.compose.ui.test.down
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.imageedit.ImageEditorCompare
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w400dp-h300dp-mdpi")
class ImageEditorCompareGestureTest {
    @get:Rule val compose = createComposeRule()

    private var begins = 0
    private var ends = 0

    private fun host(enabled: Boolean = true) {
        compose.setContent {
            Box(
                Modifier
                    .size(200.dp)
                    .testTag("host")
                    .imageEditorCompareGesture(enabled, onBegin = { begins++ }, onEnd = { ends++ }),
            )
        }
    }

    @Test fun `un appui tenu 250 ms compare a l'original puis revient au relachement`() {
        host()
        compose.onNodeWithTag("host").performTouchInput { down(center) }
        compose.mainClock.advanceTimeBy(ImageEditorCompare.HOLD_MILLIS + 50)
        compose.waitForIdle()
        assertThat(begins).isEqualTo(1)
        assertThat(ends).isEqualTo(0)
        compose.onNodeWithTag("host").performTouchInput { up() }
        compose.waitForIdle()
        assertThat(ends).isEqualTo(1)
    }

    @Test fun `un appui relache avant 250 ms n'ouvre pas la comparaison`() {
        host()
        compose.onNodeWithTag("host").performTouchInput { down(center) }
        compose.mainClock.advanceTimeBy(100)
        compose.onNodeWithTag("host").performTouchInput { up() }
        compose.mainClock.advanceTimeBy(400)
        compose.waitForIdle()
        assertThat(begins).isEqualTo(0)
        assertThat(ends).isEqualTo(0)
    }

    @Test fun `un doigt qui derive de plus de 30 dp avant 250 ms annule l'appui`() {
        host()
        compose.onNodeWithTag("host").performTouchInput { down(center) }
        compose.mainClock.advanceTimeBy(50)
        compose.onNodeWithTag("host").performTouchInput { moveBy(Offset(60f, 0f)) }
        compose.mainClock.advanceTimeBy(400)
        compose.waitForIdle()
        assertThat(begins).isEqualTo(0)
    }

    @Test fun `sans retouche le geste est inerte`() {
        host(enabled = false)
        compose.onNodeWithTag("host").performTouchInput { down(center) }
        compose.mainClock.advanceTimeBy(500)
        compose.waitForIdle()
        assertThat(begins).isEqualTo(0)
    }
}
