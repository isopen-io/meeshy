package me.meeshy.app.conversations

import androidx.compose.material3.Text
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import me.meeshy.ui.component.CollapsibleSection
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * A folded section says the unread its hidden rows carry (iOS `SectionFoldedUnread`, #8694);
 * unfolded, the rows carry their own badges and the header says nothing more.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CollapsibleSectionFoldedUnreadTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `folding a section shows the unread its rows hide`() {
        compose.setContent {
            MeeshyTheme {
                CollapsibleSection(title = "Work", count = 3, foldedUnread = 17) { Text("row") }
            }
        }
        compose.onNodeWithText("17").assertDoesNotExist()

        compose.onNodeWithText("Work").performClick()

        compose.onNodeWithText("17").assertExists()
    }

    @Test
    fun `a folded section without unread shows no extra badge`() {
        compose.setContent {
            MeeshyTheme {
                CollapsibleSection(title = "Work", count = 3, foldedUnread = 0, initiallyExpanded = false) { Text("row") }
            }
        }

        compose.onNodeWithText("0").assertDoesNotExist()
    }
}
