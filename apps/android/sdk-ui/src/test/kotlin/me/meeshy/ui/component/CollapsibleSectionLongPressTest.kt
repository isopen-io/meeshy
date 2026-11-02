package me.meeshy.ui.component

import androidx.compose.material3.Text
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** #12497 — un appui long sur l'en-tête d'une section ne la replie pas ; un toucher bref la replie. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CollapsibleSectionLongPressTest {

    @get:Rule
    val compose = createComposeRule()

    private fun render() = compose.setContent {
        MeeshyTheme { CollapsibleSection(title = "Work") { Text("row") } }
    }

    @Test
    fun `a long press on the header leaves the section open`() {
        render()

        compose.onNodeWithText("Work").performTouchInput { longClick() }
        compose.waitForIdle()

        compose.onNodeWithText("row").assertExists()
    }

    @Test
    fun `a short tap on the header folds the section`() {
        render()

        compose.onNodeWithText("Work").performClick()
        compose.waitForIdle()

        compose.onNodeWithText("row").assertDoesNotExist()
    }
}
