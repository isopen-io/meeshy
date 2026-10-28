package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotDisplayed
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Les options de la colonne droite défilent, le (x) et l'historique jamais (iOS `ComposerTrailingRail.tiles`, #13536). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class TrailingColumnFrameTest {
    @get:Rule
    val compose = createComposeRule()

    private fun show(options: Int, footFollowsOptions: Boolean, height: Int = 300) {
        compose.setContent {
            Column(Modifier.width(44.dp).height(height.dp)) {
                TrailingColumnFrame(
                    footFollowsOptions = footFollowsOptions,
                    options = { repeat(options) { Box(Modifier.size(44.dp).testTag("option$it")) } },
                    exit = { Box(Modifier.size(44.dp).testTag("exit")) },
                    foot = { Box(Modifier.size(44.dp).testTag("undo")) },
                )
            }
        }
    }

    @Test
    fun `a text and its actions on a short corridor keep the exit and the history in sight`() {
        show(options = 12, footFollowsOptions = true)
        compose.onNodeWithTag("exit").assertIsDisplayed()
        compose.onNodeWithTag("undo").assertIsDisplayed()
        compose.onNodeWithTag("option0").assertIsDisplayed()
        compose.onNodeWithTag("option11").assertIsNotDisplayed()
    }

    @Test
    fun `the brush keeps its history at the thumb, the exit right under its controllers`() {
        show(options = 2, footFollowsOptions = false)
        val exit = compose.onNodeWithTag("exit").getBoundsInRoot()
        val undo = compose.onNodeWithTag("undo").getBoundsInRoot()
        assertThat(exit.top.value).isWithin(1f).of(2 * 44f + 2 * 2f)
        assertThat(undo.bottom.value).isWithin(1f).of(300f)
    }

    @Test
    fun `an object edit packs the history right under the exit`() {
        show(options = 2, footFollowsOptions = true)
        val exit = compose.onNodeWithTag("exit").getBoundsInRoot()
        val undo = compose.onNodeWithTag("undo").getBoundsInRoot()
        assertThat(undo.top.value).isWithin(1f).of(exit.bottom.value)
    }

    @Test
    fun `a bare scene sets its history at the bottom`() {
        compose.setContent {
            Column(Modifier.width(44.dp).height(300.dp)) {
                TrailingColumnFrame(
                    footFollowsOptions = false,
                    options = null,
                    exit = {},
                    foot = { Box(Modifier.size(44.dp).testTag("undo")) },
                )
            }
        }
        assertThat(compose.onNodeWithTag("undo").getBoundsInRoot().bottom.value).isWithin(1f).of(300f)
    }
}
