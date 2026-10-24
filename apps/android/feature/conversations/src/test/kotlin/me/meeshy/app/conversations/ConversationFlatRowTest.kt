package me.meeshy.app.conversations

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertHeightIsEqualTo
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertWidthIsEqualTo
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.StoryRingState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** La rangée plate Lentille, rendue pour de vrai: 84 dp, sourdine, barre de sélection, pastille 99+. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
// Métriques de texte réelles : le rendu hérité de Robolectric gonfle chaque ligne (~36 px) et fausse la hauteur.
@GraphicsMode(GraphicsMode.Mode.NATIVE)
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

    private fun show(
        conversation: ApiConversation,
        isSelected: Boolean = false,
        typing: String? = null,
        callInProgress: Boolean = false,
        hasPendingSync: Boolean = false,
        actions: ConversationRowActions = ConversationRowActions(),
    ) {
        compose.setContent {
            // Sans animation infinie (points de frappe): l'horloge de test doit pouvoir s'immobiliser.
            CompositionLocalProvider(LocalReduceMotion provides true) {
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
                        callInProgress = callInProgress,
                        hasPendingSync = hasPendingSync,
                    ),
                    actions = actions,
                )
              }
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

    @Test
    fun `a call in progress offers Rejoin in place of the unread badge`() {
        show(conversation(unreadCount = 250), callInProgress = true)
        compose.onNodeWithText("Rejoin", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithText("99+", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun `no call in progress shows no Rejoin button`() {
        show(conversation(unreadCount = 2))
        compose.onNodeWithText("Rejoin", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun `joining the call is a custom accessibility action of the row`() {
        var joined = 0
        show(conversation(), callInProgress = true, actions = ConversationRowActions(onJoinCall = { joined++ }))
        val config = compose.onNodeWithTag(ROW_TEST_TAG, useUnmergedTree = false).fetchSemanticsNode().config
        val join = config[SemanticsActions.CustomActions].single()
        assertThat(join.label).isEqualTo("Call in progress, tap to rejoin")

        compose.runOnIdle { join.action() }

        assertThat(joined).isEqualTo(1)
    }

    @Test
    fun `a pending sync is spoken in the row label`() {
        show(conversation(), hasPendingSync = true)
        val node = compose.onNodeWithTag(ROW_TEST_TAG, useUnmergedTree = false).fetchSemanticsNode()
        assertThat(node.config[SemanticsProperties.ContentDescription].joinToString()).contains("sync pending")
    }
}
