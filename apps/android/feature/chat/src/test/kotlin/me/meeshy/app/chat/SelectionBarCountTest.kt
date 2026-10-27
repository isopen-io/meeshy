package me.meeshy.app.chat

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.unit.height
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** #13385 — « N sélectionnés » tient sur UNE ligne à 360 dp, police 1,3, et la barre garde sa hauteur. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SelectionBarCountTest {

    @get:Rule
    val compose = createComposeRule()

    private val offer = SelectionOffer(forward = true, copy = true, star = true, deleteForMe = true, deleteForEveryone = false)

    private fun render(count: Int, ticked: androidx.compose.runtime.MutableState<Int> = androidx.compose.runtime.mutableStateOf(count)) {
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides Density(LocalDensity.current.density, fontScale = 1.3f)) {
                MeeshyTheme(darkTheme = false) {
                    Box(Modifier.fillMaxSize()) {
                        SelectionBar(
                            count = ticked.value,
                            offer = offer,
                            accentColor = MeeshyPalette.Indigo500,
                            onCancel = {}, onDelete = {}, onCopy = {}, onStar = {}, onForward = {},
                            modifier = Modifier.align(Alignment.BottomCenter).width(360.dp),
                            bottomClearance = 0.dp,
                        )
                    }
                }
            }
        }
        compose.waitForIdle()
    }

    private fun countHeight(): Float = compose.onNodeWithTag(SELECTION_COUNT_TAG).getUnclippedBoundsInRoot().height.value

    @Test
    fun `the count stays on one line when two or twelve messages are ticked`() {
        render(count = 12)
        assertThat(countHeight()).isLessThan(45f)
    }

    @Test
    fun `the count line has the same height whether it shows a count or not`() {
        val ticked = androidx.compose.runtime.mutableStateOf(1)
        render(count = 1, ticked = ticked)
        val one = countHeight()

        ticked.value = 2
        compose.waitForIdle()

        assertThat(countHeight()).isEqualTo(one)
    }
}
