package me.meeshy.app.conversations

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.CategoryOption
import me.meeshy.sdk.model.conversationlist.ConversationRowMenuCapabilities
import me.meeshy.sdk.model.conversationlist.ConversationRowMenuCapabilities.Removal
import me.meeshy.sdk.model.conversationoptions.MoveMenuTarget
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp")
class ConversationMenuContentTest {

    @get:Rule
    val compose = createComposeRule()

    private val entries = mutableListOf<ConversationMenuEntry>()
    private val reactions = mutableListOf<String?>()
    private val moves = mutableListOf<MoveMenuTarget>()

    private val law = ConversationRowMenuCapabilities(
        rename = false,
        invite = true,
        leave = true,
        report = true,
        adminOpen = false,
        removal = Removal.HIDE,
        canToggleArchive = true,
        manageMembers = false,
    )

    private val categories = listOf(CategoryOption(id = "work", name = "Travail", order = 1))

    private fun model() = ConversationMenuModel.make(
        ConversationMenuInput(
            capabilities = law,
            isPinned = false,
            isMuted = false,
            mentionsOnly = false,
            hasUnread = false,
            hasDraft = false,
            isLocked = false,
            isArchived = false,
            isPeerBlocked = null,
            isCreator = false,
            destinations = ConversationMenuDestinations(details = true),
        ),
    )

    private fun render(currentCategoryId: String? = "work", currentReaction: String? = null) {
        compose.setContent {
            MeeshyTheme {
                ConversationMenuContent(
                    model = model(),
                    panelState = ConversationMenuPanelState(currentReaction, categories, currentCategoryId),
                    accent = MeeshyPalette.Indigo500,
                    onEntry = { entries += it },
                    onSetReaction = { reactions += it },
                    onMove = { moves += it },
                    onCreateCategory = {},
                )
            }
        }
    }

    @Test
    fun `the root panel draws the entries of the model, tiles first and departures last`() {
        render()
        listOf(
            ConversationMenuEntry.PIN,
            ConversationMenuEntry.MUTE,
            ConversationMenuEntry.MARK_UNREAD,
            ConversationMenuEntry.SEARCH,
            ConversationMenuEntry.DETAILS,
            ConversationMenuEntry.FAVORITE,
            ConversationMenuEntry.MOVE,
            ConversationMenuEntry.LEAVE,
            ConversationMenuEntry.HIDE,
        ).forEach { compose.onNodeWithTag(menuEntryTestTag(it)).assertIsDisplayed() }
        compose.onNodeWithTag(MORE_TEST_TAG).assertIsDisplayed()
    }

    @Test
    fun `an entry the model does not offer is not drawn`() {
        render()
        compose.onNodeWithTag(menuEntryTestTag(ConversationMenuEntry.CALL)).assertDoesNotExist()
        compose.onNodeWithTag(menuEntryTestTag(ConversationMenuEntry.RENAME)).assertDoesNotExist()
    }

    @Test
    fun `touching a plain entry hands it over`() {
        render()
        compose.onNodeWithTag(menuEntryTestTag(ConversationMenuEntry.HIDE)).performClick()
        compose.onNodeWithTag(menuEntryTestTag(ConversationMenuEntry.PIN)).performClick()
        assertThat(entries).containsExactly(ConversationMenuEntry.HIDE, ConversationMenuEntry.PIN).inOrder()
    }

    @Test
    fun `more options opens the second panel with invite and report, and back returns to the root`() {
        render()
        compose.onNodeWithTag(MORE_TEST_TAG).performClick()
        compose.onNodeWithTag(menuEntryTestTag(ConversationMenuEntry.INVITE)).assertIsDisplayed()
        compose.onNodeWithTag(menuEntryTestTag(ConversationMenuEntry.REPORT)).assertIsDisplayed()
        compose.onNodeWithTag(BACK_TEST_TAG).performClick()
        compose.onNodeWithTag(menuEntryTestTag(ConversationMenuEntry.SEARCH)).assertIsDisplayed()
    }

    @Test
    fun `favorite opens eight emojis and a choice is reported`() {
        render()
        compose.onNodeWithTag(menuEntryTestTag(ConversationMenuEntry.FAVORITE)).performClick()
        FAVORITE_REACTION_CHOICES.forEach { compose.onNodeWithTag("conversation-menu-favorite-$it").assertIsDisplayed() }
        compose.onNodeWithTag("conversation-menu-favorite-🔥").performClick()
        assertThat(reactions).containsExactly("🔥")
    }

    @Test
    fun `remove favorite appears only once a favorite is set`() {
        render(currentReaction = "🔥")
        compose.onNodeWithTag(menuEntryTestTag(ConversationMenuEntry.FAVORITE)).performClick()
        compose.onNodeWithTag("conversation-menu-favorite-remove").performClick()
        assertThat(reactions).containsExactly(null)
    }

    @Test
    fun `move lists the categories then my conversations, and a touch reports the target`() {
        render()
        compose.onNodeWithTag(menuEntryTestTag(ConversationMenuEntry.MOVE)).performClick()
        compose.onNodeWithTag("conversation-menu-move-work").assertIsDisplayed()
        compose.onNodeWithText("My conversations").assertIsDisplayed()
        compose.onNodeWithTag("conversation-menu-move-none").performClick()
        assertThat(moves.map { it.categoryId }).containsExactly(null)
    }

}
