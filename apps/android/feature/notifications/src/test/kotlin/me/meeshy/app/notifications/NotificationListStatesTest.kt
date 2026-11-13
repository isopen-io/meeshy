package me.meeshy.app.notifications

import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.NotificationFilterCategory
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "en-w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class NotificationListStatesTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `the skeleton is announced once as loading`() {
        compose.setContent { NotificationListSkeleton() }
        compose.onNode(hasContentDescription("Loading…")).assertIsDisplayed()
        assertThat(compose.onAllNodes(hasContentDescription("Loading…")).fetchSemanticsNodes()).hasSize(1)
    }

    @Test
    fun `the retry capsule relaunches the load and keeps a 44 dp target`() {
        var retries = 0
        compose.setContent { NotificationListErrorState(onRetry = { retries++ }) }

        compose.onNodeWithText("Notifications unavailable").assertIsDisplayed()
        compose.onNodeWithText("Check your connection, then try again.").assertIsDisplayed()
        val retry = compose.onNodeWithText("Retry")
        retry.assertHeightIsAtLeast(44.dp)
        retry.assertWidthIsAtLeast(44.dp)
        retry.performClick()

        assertThat(retries).isEqualTo(1)
    }

    @Test
    fun `an empty category says its title and nothing else`() {
        compose.setContent { NotificationListEmptyState(NotificationFilterCategory.ALL) }

        compose.onNodeWithText("No notifications").assertIsDisplayed()
        compose.onNodeWithText("Your notifications will appear here").assertDoesNotExist()
    }
}
