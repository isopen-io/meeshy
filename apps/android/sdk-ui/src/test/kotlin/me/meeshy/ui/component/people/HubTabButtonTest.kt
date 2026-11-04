package me.meeshy.ui.component.people

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class HubTabButtonTest {

    @get:Rule
    val compose = createComposeRule()

    private var clicks = 0

    private fun show(selected: Boolean, badge: Int = 0) {
        compose.setContent {
            MeeshyTheme {
                HubTabButton(
                    icon = MeeshyIcons.Call,
                    title = "Calls",
                    isSelected = selected,
                    onClick = { clicks++ },
                    badge = badge,
                )
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `the tab is announced as Tab plus its title`() {
        show(selected = false)

        compose.onNodeWithContentDescription("Tab Calls").assertIsNotSelected().performClick()
        assertThat(clicks).isEqualTo(1)
    }

    @Test
    fun `a selected tab exposes the selected state`() {
        show(selected = true)

        compose.onNodeWithContentDescription("Tab Calls").assertIsSelected()
    }

    @Test
    fun `a positive badge is exposed as the state value`() {
        show(selected = false, badge = 4)

        compose.onNodeWithContentDescription("Tab Calls")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "4"))
    }

    @Test
    fun `a zero badge exposes no state value`() {
        show(selected = false, badge = 0)

        compose.onNodeWithContentDescription("Tab Calls")
            .assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.StateDescription))
    }
}
