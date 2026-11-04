package me.meeshy.app.chat.mediahub

import androidx.compose.foundation.layout.Column
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.assertIsDisplayed
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConversationMediaHubScreenTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(content: @androidx.compose.runtime.Composable () -> Unit) {
        compose.setContent { MeeshyTheme { Column { content() } } }
    }

    @Test
    fun `an error offers a retry that fires once per tap`() {
        var retries = 0
        show {
            MediaHubStateView(MeeshyIcons.Warning, "This list couldn’t be loaded.", MeeshyPalette.Indigo500, "Try again") { retries++ }
        }

        compose.onNodeWithText("This list couldn’t be loaded.").assertIsDisplayed()
        compose.onNodeWithText("Try again").performClick()

        assertThat(retries).isEqualTo(1)
    }

    @Test
    fun `an empty segment says so without offering a retry`() {
        show { MediaHubStateView(MeeshyIcons.Search, "No results for “zz”", MeeshyPalette.Indigo500) }

        compose.onNodeWithText("No results for “zz”").assertIsDisplayed()
        compose.onNodeWithText("Try again").assertDoesNotExist()
    }

    @Test
    fun `the first-load skeletons draw without any text or spinner`() {
        show {
            MediaHubRowSkeleton()
            MediaHubTileSkeleton()
        }

        compose.onNodeWithText("Try again").assertDoesNotExist()
    }
}
