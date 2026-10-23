package me.meeshy.app.conversations

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertHeightIsEqualTo
import androidx.compose.ui.test.assertDoesNotExist
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertWidthIsEqualTo
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.ui.component.StoryRingState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** La rangée plate Lentille, rendue pour de vrai: 84 dp, sourdine, barre de sélection, pastille 99+. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConversationFlatRowTest {

    @get:Rule
    val compose = createComposeRule()

    private fun conversation(
        unreadCount: Int = 0,
        prefs: ApiConversationPreferences? = null,
    ) = ApiConversation(
        id = "c1",
        title = "Team",
        type = "group",
        unreadCount = unreadCount,
        userPreferences = listOfNotNull(prefs),
    )

    private fun show(conversation: ApiConversation, isSelected: Boolean = false, typing: String? = null) {
        compose.setContent {
            MeeshyTheme {
                ConversationRowContainer(
                    model = ConversationRowModel(
                        conversation = conversation,
                        currentUserId = "me",
                        currentUserPrefs = null,
                        presence = null,
                        storyRing = StoryRingState.None,
                        moodEmoji = null,
                        draft = null,
                        typingDisplayName = typing,
                        categories = emptyList(),
                        previewMessages = null,
                        isLocked = false,
                        nowMillis = 0L,
                        isSelected = isSelected,
                    ),
                    actions = ConversationRowActions(),
                )
            }
        }
    }

    @Test
    fun `the flat row is exactly 84 dp tall`() {
        show(conversation())
        compose.onNodeWithTag(ROW_TEST_TAG, useUnmergedTree = true).assertHeightIsEqualTo(84.dp)
    }

    @Test
    fun `a muted row stays on screen and dims to the Lentille opacity`() {
        show(conversation(prefs = ApiConversationPreferences(isMuted = true)))
        val alpha = ConversationRowAppearance.rowOpacity(isMuted = true, isDragging = false)
        assertThat(alpha).isEqualTo(0.55f)
        compose.onNodeWithTag(ROW_TEST_TAG, useUnmergedTree = true).assertIsDisplayed()
    }

    @Test
    fun `the selected row carries a 3 dp accent bar, an unselected one none`() {
        show(conversation(), isSelected = true)
        compose.onNodeWithTag(ROW_SELECTION_BAR_TEST_TAG, useUnmergedTree = true).assertWidthIsEqualTo(3.dp)
    }

    @Test
    fun `an unselected row draws no selection bar`() {
        show(conversation(), isSelected = false)
        compose.onNodeWithTag(ROW_SELECTION_BAR_TEST_TAG, useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun `more than 99 unread shows 99+`() {
        show(conversation(unreadCount = 250))
        compose.onNodeWithText("99+", useUnmergedTree = true).assertIsDisplayed()
    }

    @Test
    fun `the row is one selected button with a full label`() {
        show(conversation(unreadCount = 2), isSelected = true)
        val node = compose.onNodeWithTag(ROW_TEST_TAG, useUnmergedTree = false).fetchSemanticsNode()
        val config = node.config
        assertThat(config[SemanticsProperties.Selected]).isTrue()
        assertThat(config[SemanticsProperties.ContentDescription].joinToString()).contains("Team")
    }

    @Test
    fun `a typing peer replaces the preview with the typing line`() {
        show(conversation(), typing = "Ana")
        compose.onNodeWithText("Ana is typing", useUnmergedTree = true).assertIsDisplayed()
    }
}

