package me.meeshy.ui.component.bubble

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createComposeRule
import kotlinx.coroutines.flow.MutableStateFlow
import me.meeshy.sdk.model.media.MediaUploadProgress
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le pied d'une bulle en attente porte la progression de SES pièces (#16133) : le témoin passe par la bulle entière,
 * pas par la seule pastille, pour qu'un câblage perdu entre le pied et la pastille rougisse.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BubbleSendProgressFooterTest {

    @get:Rule
    val compose = createComposeRule()

    private val ledger = MutableStateFlow<Map<String, MediaUploadProgress>>(emptyMap())

    private fun bubble(files: List<String>, isPending: Boolean = true) = BubbleContent(
        messageId = "tmp-1",
        text = "le contrat",
        isOutgoing = true,
        isTranslated = false,
        originalText = null,
        senderName = null,
        showSenderName = false,
        isEdited = false,
        isDeleted = false,
        createdAtIso = null,
        deliveryStatus = if (isPending) DeliveryStatus.Pending else DeliveryStatus.Sent,
        isPending = isPending,
        files = files.map { BubbleFile(attachmentId = it, name = "$it.pdf", sizeBytes = 100) },
    )

    private fun show(content: BubbleContent, landed: Set<String> = emptySet()) {
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalUploadProgress provides BubbleUploadProgress(ledger) { it in landed }) {
                    MessageBubble(content = content)
                }
            }
        }
        compose.waitForIdle()
    }

    private fun announced(text: String) = compose.onAllNodes(hasContentDescription(text), useUnmergedTree = true)

    @Test
    fun `une bulle en attente montre a la place de l'horloge le pourcentage de sa piece`() {
        ledger.value = mapOf("cmid-a" to MediaUploadProgress.Uploading(42, 100))

        show(bubble(listOf("cmid-a")))

        announced("Sending, 42%").assertCountEquals(1)
    }

    @Test
    fun `la bulle ne repart pas de zero quand sa premiere piece a atterri`() {
        ledger.value = mapOf("cmid-b" to MediaUploadProgress.Uploading(0, 100))

        show(bubble(listOf("cmid-a", "cmid-b")), landed = setOf("cmid-a"))

        announced("Sending, 50%").assertCountEquals(1)
    }

    @Test
    fun `une bulle envoyee ne montre aucune progression meme si un identifiant traine au registre`() {
        ledger.value = mapOf("cmid-a" to MediaUploadProgress.Uploading(42, 100))

        show(bubble(listOf("cmid-a"), isPending = false))

        announced("Sending, 42%").assertCountEquals(0)
    }
}
