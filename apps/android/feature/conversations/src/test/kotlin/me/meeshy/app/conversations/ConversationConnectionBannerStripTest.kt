package me.meeshy.app.conversations

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.assertIsDisplayed
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConversationConnectionBannerStripTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `offline banner announces the offline state`() {
        compose.setContent { MeeshyTheme { ConnectionBannerStrip(ConnectionBanner.OFFLINE) } }

        compose.onNodeWithText("Offline", substring = true, ignoreCase = true).assertIsDisplayed()
    }

    @Test
    fun `hidden banner draws nothing`() {
        compose.setContent { MeeshyTheme { ConnectionBannerStrip(ConnectionBanner.HIDDEN) } }

        compose.onNodeWithText("Offline", substring = true, ignoreCase = true).assertDoesNotExist()
    }
}
