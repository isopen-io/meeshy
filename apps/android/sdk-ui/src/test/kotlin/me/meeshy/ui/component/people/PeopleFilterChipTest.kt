package me.meeshy.ui.component.people

import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PeopleFilterChipTest {

    @get:Rule
    val compose = createComposeRule()

    private var clicks = 0

    private fun show(title: String, selected: Boolean, count: Int? = null) {
        compose.setContent {
            MeeshyTheme { PeopleFilterChip(title = title, isSelected = selected, onClick = { clicks++ }, count = count) }
        }
        compose.waitForIdle()
    }

    @Test
    fun `the label carries the count when it is positive`() {
        assertThat(PeopleFilterLabel.compose("Online", 3)).isEqualTo("Online (3)")
    }

    @Test
    fun `a zero or missing count is hidden`() {
        assertThat(PeopleFilterLabel.compose("Online", 0)).isEqualTo("Online")
        assertThat(PeopleFilterLabel.compose("Online", null)).isEqualTo("Online")
    }

    @Test
    fun `a selected chip exposes the selected state and taps through`() {
        show("All", selected = true, count = 2)

        compose.onNodeWithText("All (2)").assertIsSelected().performClick()
        assertThat(clicks).isEqualTo(1)
    }

    @Test
    fun `an unselected chip is not selected`() {
        show("All", selected = false)

        compose.onNodeWithText("All").assertIsNotSelected()
    }
}
