package me.meeshy.app.conversations

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performSemanticsAction
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.StoryRingState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #12865 — the row menu offers « Manage members » exactly where the shared law grants it, as on
 * iOS (#12631), and the entry opens the members sheet of THAT conversation.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConversationRowManageMembersTest {

    @get:Rule
    val compose = createComposeRule()

    private val manageMembers = "Manage members"

    private fun conversation(type: String = "group", role: String = "moderator", isActive: Boolean = true) =
        ApiConversation(
            id = "c1",
            identifier = "c1",
            type = type,
            title = "Team",
            isActive = isActive,
            currentUserRole = role,
            participants = if (type == "direct") listOf(ApiParticipant(id = "p-peer", userId = "peer")) else emptyList(),
        )

    private fun user(role: String = "USER") =
        MeeshyUser(id = "me", username = "me", displayName = "Me", role = role, isAnonymous = false)

    private fun openMenu(
        conversation: ApiConversation,
        user: MeeshyUser? = user(),
        isLocked: Boolean = false,
        opened: MutableList<String> = mutableListOf(),
    ) {
        val navigation = ConversationRowNavigation(onManageMembers = { id, _: Color -> opened += id })
        compose.setContent {
            CompositionLocalProvider(LocalReduceMotion provides true) {
                MeeshyTheme {
                    ConversationRowContainer(
                        model = ConversationRowModel(
                            conversation = conversation,
                            currentUserId = "me",
                            currentUserPrefs = user,
                            presence = null,
                            storyRing = StoryRingState.None,
                            moodEmoji = null,
                            draft = null,
                            typingDisplayName = null,
                            categories = emptyList(),
                            previewMessages = null,
                            isLocked = isLocked,
                            nowMillis = 0L,
                        ),
                        actions = ConversationRowActions().withNavigation(navigation, conversation, "me"),
                    )
                }
            }
        }
        compose.onNodeWithTag(ROW_TEST_TAG).performSemanticsAction(SemanticsActions.OnLongClick)
        compose.waitForIdle()
    }

    @Test
    fun `a group moderator manages the members of that conversation from its row`() {
        val opened = mutableListOf<String>()
        openMenu(conversation(role = "moderator"), opened = opened)

        compose.onNodeWithText(manageMembers).performSemanticsAction(SemanticsActions.OnClick)
        compose.waitForIdle()

        assertThat(opened).containsExactly("c1")
    }

    @Test
    fun `a plain member is not offered member management`() {
        openMenu(conversation(role = "member"))

        compose.onNodeWithText(manageMembers).assertDoesNotExist()
    }

    @Test
    fun `a platform moderator who is a member of the group manages its members`() {
        openMenu(conversation(role = "member"), user = user(role = "MODERATOR"))

        compose.onNodeWithText(manageMembers).assertExists()
    }

    @Test
    fun `a direct never offers member management`() {
        openMenu(conversation(type = "direct", role = "creator"), user = user(role = "ADMIN"))

        compose.onNodeWithText(manageMembers).assertDoesNotExist()
    }

    @Test
    fun `a closed conversation offers no member management`() {
        openMenu(conversation(role = "creator", isActive = false))

        compose.onNodeWithText(manageMembers).assertDoesNotExist()
    }

    @Test
    fun `a locked row offers no member management`() {
        openMenu(conversation(role = "creator"), isLocked = true)

        compose.onNodeWithText(manageMembers).assertDoesNotExist()
    }
}
