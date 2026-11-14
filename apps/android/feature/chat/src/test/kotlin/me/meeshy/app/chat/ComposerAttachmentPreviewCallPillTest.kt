package me.meeshy.app.chat

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.PendingAttachment
import me.meeshy.sdk.model.composer.PendingAttachmentType
import me.meeshy.ui.component.viewer.LocalViewerTopOverlay
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * S1.8 (#17766) — l'aperçu plein écran d'une pièce en attente est une fenêtre à part : la pastille de l'appel réduit s'y
 * redessine, au-dessus de « Annuler », pour que l'appel reste atteignable pendant qu'on prépare un envoi.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class ComposerAttachmentPreviewCallPillTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `la pastille de l'appel reduit reste posee au-dessus de l'apercu plein ecran d'une piece`() {
        val pill: @Composable () -> Unit = { Text("pastille d'appel") }
        val item = PendingAttachment(id = "a1", type = PendingAttachmentType.FILE, fileName = "devis.pdf", localPath = "/tmp/devis.pdf")
        compose.setContent {
            CompositionLocalProvider(LocalViewerTopOverlay provides pill) {
                ComposerAttachmentPreview(item = item, onDismiss = {}, onDelete = {})
            }
        }
        compose.waitForIdle()

        val bottomOfPill = compose.onNodeWithText("pastille d'appel").getUnclippedBoundsInRoot().bottom.value
        val topOfCancel = compose.onNodeWithText("Cancel").getUnclippedBoundsInRoot().top.value
        assertThat(topOfCancel).isAtLeast(bottomOfPill)
    }
}
