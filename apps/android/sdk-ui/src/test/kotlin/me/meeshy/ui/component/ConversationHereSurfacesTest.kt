package me.meeshy.ui.component

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.MutableStateFlow
import me.meeshy.sdk.model.presence.ConversationViewers
import me.meeshy.sdk.model.presence.ViewingChange
import me.meeshy.sdk.model.presence.ViewingEvent
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.ui.component.bubble.BubbleCallbacks
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.FocalFlatRow
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le point « ici » d'un pair qui REGARDE la conversation (#13744) : il se lit AU PLUS BAS niveau
 * (`rememberConversationHere`), ne vaut que pour CETTE conversation, et sans annonce du serveur
 * aucun point n'est fabriqué.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConversationHereSurfacesTest {

    @get:Rule
    val compose = createComposeRule()

    private val viewers = MutableStateFlow(ConversationViewers())

    private fun arrive(userId: String, conversationId: String) {
        viewers.value = viewers.value.applying(ViewingEvent.Arrived(ViewingChange(userId, conversationId)))
        compose.waitForIdle()
    }

    private fun showAvatar(provided: Boolean = true, conversationId: String? = "c1") {
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalConversationViewers provides viewers.takeIf { provided }) {
                    Box {
                        MeeshyAvatar(
                            name = "Alice",
                            size = 40.dp,
                            here = rememberConversationHere("u1", conversationId),
                        )
                    }
                }
            }
        }
    }

    private fun assertHereDots(count: Int) =
        compose.onAllNodesWithTag(AvatarPresenceDotTestTag, useUnmergedTree = true).assertCountEquals(count)

    @Test
    fun `nobody announced here means no dot`() {
        showAvatar()
        assertHereDots(0)
    }

    @Test
    fun `a peer who arrives in this conversation lights the dot, and leaving puts it out`() {
        showAvatar()
        arrive("u1", "c1")
        assertHereDots(1)
        viewers.value = viewers.value.applying(ViewingEvent.Left(ViewingChange("u1", "c1")))
        compose.waitForIdle()
        assertHereDots(0)
    }

    @Test
    fun `being here in another conversation shows nothing`() {
        showAvatar()
        arrive("u1", "c2")
        assertHereDots(0)
    }

    @Test
    fun `an unknown conversation or user never fabricates a dot`() {
        showAvatar(conversationId = null)
        arrive("u1", "c1")
        assertHereDots(0)
    }

    @Test
    fun `without a viewing source nothing is drawn`() {
        showAvatar(provided = false)
        assertHereDots(0)
    }

    @Test
    fun `a message row's author avatar carries the dot of a peer who is here`() {
        val content = BubbleContent(
            messageId = "m1",
            viewingConversationId = "c1",
            text = "Bonsoir",
            isOutgoing = false,
            isTranslated = false,
            originalText = null,
            senderName = "Alice",
            showSenderName = false,
            senderProfile = ProfileSheetUser(userId = "u1", username = "alice"),
            isEdited = false,
            isDeleted = false,
            createdAtIso = "2026-10-01T07:48:00Z",
            isFirstInGroup = true,
        )
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalConversationViewers provides viewers) {
                    FocalFlatRow(content = content, accentColor = Color.Blue, callbacks = BubbleCallbacks.None)
                }
            }
        }
        assertHereDots(0)
        arrive("u1", "c1")
        assertHereDots(1)
    }
}
