package me.meeshy.app.stories

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.StoryLocationObject
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StoryLocationTapOverlayTest {

    @get:Rule
    val compose = createComposeRule()

    private val paris = StoryLocationObject(id = "p", place = SharedPlace(48.85, 2.35, name = "Paris"), scale = 0.3)

    private class Calls {
        var advanced = 0
        val tapped = mutableListOf<SharedPlace>()
    }

    private fun show(hidden: Boolean = false): Calls {
        val calls = Calls()
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.size(360.dp, 640.dp)) {
                    Box(Modifier.fillMaxSize().clickable { calls.advanced++ })
                    StoryLocationTapOverlay(listOf(paris), onTap = { calls.tapped += it }, hidden = hidden)
                }
            }
        }
        return calls
    }

    @Test
    fun `toucher la pastille ouvre le lieu et ne fait pas avancer la story`() {
        val calls = show()
        compose.onNodeWithTag(STORY_LOCATION_TAP_TAG).performClick()
        assertThat(calls.tapped).containsExactly(paris.place)
        assertThat(calls.advanced).isEqualTo(0)
    }

    @Test
    fun `une pastille minuscule garde une cible d au moins 48 dp`() {
        show()
        compose.onNodeWithTag(STORY_LOCATION_TAP_TAG).assertWidthIsAtLeast(48.dp).assertHeightIsAtLeast(48.dp)
    }

    @Test
    fun `la cible s efface pendant la saisie d un commentaire`() {
        show(hidden = true)
        compose.onAllNodesWithTag(STORY_LOCATION_TAP_TAG).assertCountEquals(0)
    }
}
