package me.meeshy.ui.component.focal

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ScrollTimePillTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(label: String?, visible: Boolean) {
        compose.setContent { MeeshyTheme { ScrollTimePill(label = { label }, isVisible = { visible }) } }
        compose.waitForIdle()
    }

    @Test
    fun `visible elle rend le libelle jour heure`() {
        show("Aujourd'hui · 14:32", visible = true)

        compose.onAllNodesWithText("Aujourd'hui · 14:32", useUnmergedTree = true).assertCountEquals(1)
    }

    @Test
    fun `masquee elle ne rend rien`() {
        show("Hier · 09:00", visible = false)

        compose.onAllNodesWithText("Hier · 09:00", useUnmergedTree = true).assertCountEquals(0)
    }

    @Test
    fun `sans libelle elle ne rend rien meme visible`() {
        show(null, visible = true)

        compose.onAllNodesWithText("", useUnmergedTree = true).assertCountEquals(0)
    }

    @Test
    fun `elle est cachee de TalkBack`() {
        show("Hier · 09:00", visible = true)

        compose.onNodeWithTag(ScrollTimePillTag)
            .assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Text))
            .assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.ContentDescription))
        compose.onAllNodesWithText("Hier · 09:00").assertCountEquals(0)
    }
}
