package me.meeshy.ui.component.focal

import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.bubble.DeliveryStatus
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FocalMetaColumnTest {

    @get:Rule
    val compose = createComposeRule()

    private fun input(isMe: Boolean = true, status: DeliveryStatus = DeliveryStatus.Delivered) = FocalRowInput(
        messageId = "m1", isMe = isMe, isFirstInGroup = true, isLastInGroup = true, senderName = "Mégane",
        senderUserId = null, senderAvatarUrl = null, senderColorHex = null, senderIsAnonymous = false,
        isAgentAuthored = false, viewingConversationId = null, createdAtIso = "2026-10-01T07:48:00Z",
        deliveryStatus = status, isSlowSend = false, isEdited = false, isOptimistic = false,
    )

    private fun show(input: FocalRowInput, alpha: Float, onRead: (() -> Unit)? = null) {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.testTag("col")) {
                    FocalMetaColumn(input = input, metaAlpha = { alpha }, onShowReadStatus = onRead)
                }
            }
        }
    }

    @Test
    fun `la colonne garde sa largeur de 62 que l'heure soit revelee ou non`() {
        show(input(), alpha = 0f)
        compose.onNodeWithTag("col").assertWidthIsAtLeast(62.dp)
    }

    @Test
    fun `l'heure reste dans l'arbre au repos, sa place est reservee`() {
        show(input(), alpha = 0f)
        assertThat(compose.onAllNodes(hasText(":", substring = true), useUnmergedTree = true).fetchSemanticsNodes()).isNotEmpty()
    }

    @Test
    fun `un toucher sur les coches revelees ouvre les details de lecture`() {
        var opened = 0
        show(input(), alpha = 1f, onRead = { opened++ })
        compose.onNodeWithContentDescription("Delivered", useUnmergedTree = true).performClick()
        assertThat(opened).isEqualTo(1)
    }

    @Test
    fun `des coches encore cachees ne se touchent pas`() {
        var opened = 0
        show(input(), alpha = 0f, onRead = { opened++ })
        compose.onNodeWithContentDescription("Delivered", useUnmergedTree = true).performClick()
        assertThat(opened).isEqualTo(0)
    }

    @Test
    fun `un message recu ne porte pas de coche`() {
        show(input(isMe = false), alpha = 1f)
        assertThat(
            compose.onAllNodes(androidx.compose.ui.test.hasContentDescription("Delivered"), useUnmergedTree = true).fetchSemanticsNodes(),
        ).isEmpty()
    }
}
