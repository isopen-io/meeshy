package me.meeshy.app.notifications

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationActor
import me.meeshy.sdk.model.NotificationQuickAction
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "en-w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class NotificationQuickActionsRowTest {

    @get:Rule
    val compose = createComposeRule()

    private val notification = ApiNotification(
        id = "n1",
        type = "contact_joined",
        actor = NotificationActor(id = "u1", username = "ana"),
    )
    private val connect = NotificationQuickAction.Connect("u1")
    private val write = NotificationQuickAction.Write("u1")

    private fun show(sent: Boolean, taps: MutableList<NotificationQuickAction> = mutableListOf()) = compose.setContent {
        QuickActionsRow(notification, listOf(connect, write), isConnectRequested = sent) { _, action -> taps += action }
    }

    @Test
    fun `both gestes carry their test tags and a tap reports the action`() {
        val taps = mutableListOf<NotificationQuickAction>()
        show(sent = false, taps)

        compose.onNodeWithTag("notification.quick.connect.n1").performClick()
        compose.onNodeWithTag("notification.quick.write.n1").performClick()

        assertThat(taps).containsExactly(connect, write).inOrder()
    }

    @Test
    fun `a sent request reads Request sent and is inert`() {
        val taps = mutableListOf<NotificationQuickAction>()
        show(sent = true, taps)

        compose.onNodeWithTag("notification.quick.connect.n1").assertIsNotEnabled()
        compose.onNodeWithTag("notification.quick.write.n1").assertIsEnabled()
        compose.onNodeWithTag("notification.quick.connect.n1").performClick()
        assertThat(taps).isEmpty()
    }
}
