package me.meeshy.ui.component.bubble

import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import kotlinx.coroutines.flow.MutableStateFlow
import me.meeshy.sdk.model.BubbleSendProgress
import me.meeshy.sdk.model.media.MediaUploadProgress
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SendProgressPillRobolectricTest {

    @get:Rule
    val compose = createComposeRule()

    private val ledger = MutableStateFlow<Map<String, MediaUploadProgress>>(emptyMap())

    private fun show(ids: List<String>) = compose.setContent {
        SendProgressPill(
            pieces = ids.map { BubbleSendProgress.Piece(it, 100) },
            source = BubbleUploadProgress(ledger) { false },
            color = Color.Gray,
            modifier = Modifier.testTag("pill"),
            fallback = { Text("clock", Modifier.testTag("clock")) },
        )
    }

    @Test
    fun `la pastille dit son pourcentage a TalkBack`() {
        ledger.value = mapOf("cmid-a" to MediaUploadProgress.Uploading(42, 100))

        show(listOf("cmid-a"))

        compose.onNodeWithTag("pill").assertContentDescriptionEquals("Sending, 42%")
    }

    @Test
    fun `la pastille suit sa propre piece et pas celle d'un autre envoi`() {
        ledger.value = mapOf(
            "cmid-a" to MediaUploadProgress.Uploading(10, 100),
            "cmid-b" to MediaUploadProgress.Uploading(90, 100),
        )

        show(listOf("cmid-a"))
        compose.onNodeWithTag("pill").assertContentDescriptionEquals("Sending, 10%")

        ledger.value = ledger.value + ("cmid-a" to MediaUploadProgress.Uploading(11, 100))
        compose.waitForIdle()
        compose.onNodeWithTag("pill").assertContentDescriptionEquals("Sending, 11%")
    }

    @Test
    fun `sans progression connue l'horloge d'envoi reste`() {
        show(listOf("cmid-a"))

        compose.onNodeWithTag("clock").assertIsDisplayed()
    }
}
