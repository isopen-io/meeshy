package me.meeshy.app.profile

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.profile.R
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ProfileConversationsTabTest {

    @get:Rule
    val compose = createComposeRule()

    private val context = RuntimeEnvironment.getApplication()
    private val rows = listOf(
        SharedConversationRow(id = "g1", title = "Equipe", avatarUrl = null, accentHex = "6366F1"),
        SharedConversationRow(id = "d1", title = "Ada", avatarUrl = null, accentHex = "34D399"),
    )

    private fun tab(
        view: ProfileConversationsView,
        shown: List<SharedConversationRow> = emptyList(),
        onOpen: (String) -> Unit = {},
        onSend: () -> Unit = {},
    ) = compose.setContent {
        MeeshyTheme(darkTheme = false) {
            ProfileConversationsTab(view, shown, isOpeningConversation = false, onOpen = onOpen, onSendMessage = onSend)
        }
    }

    @Test
    fun `l'etat vide montre le texte et le bouton Message compact`() {
        var sent = 0
        tab(ProfileConversationsView.Empty(interactionsDisabled = false, showsMessagePill = true), onSend = { sent++ })

        compose.onNodeWithText(context.getString(R.string.profile_conversations_noShared)).assertIsDisplayed()
        compose.onNodeWithTag(PROFILE_COMPACT_MESSAGE_TAG).assertIsDisplayed().performClick()
        assertThat(sent).isEqualTo(1)
    }

    @Test
    fun `l'etat vide bloque dit Interactions desactivees et n'offre aucun bouton`() {
        tab(ProfileConversationsView.Empty(interactionsDisabled = true, showsMessagePill = false))

        compose.onNodeWithText(context.getString(R.string.profile_conversations_interactionsDisabled)).assertIsDisplayed()
        compose.onNodeWithTag(PROFILE_COMPACT_MESSAGE_TAG).assertDoesNotExist()
    }

    @Test
    fun `toucher une rangee ouvre cette conversation`() {
        val opened = mutableListOf<String>()
        tab(ProfileConversationsView.Listing(interactionsDisabled = false, showsMessageButton = true), rows, onOpen = { opened += it })

        compose.onNodeWithText("Equipe").assertIsDisplayed()
        compose.onNodeWithTag(PROFILE_SHARED_ROW_TAG_PREFIX + "d1").performClick()

        assertThat(opened).containsExactly("d1")
    }

    @Test
    fun `bloque, plus aucune rangee ne repond`() {
        val opened = mutableListOf<String>()
        tab(ProfileConversationsView.Listing(interactionsDisabled = true, showsMessageButton = true), rows, onOpen = { opened += it })

        compose.onNodeWithTag(PROFILE_SHARED_ROW_TAG_PREFIX + "g1").performClick()

        assertThat(opened).isEmpty()
    }

    @Test
    fun `le bouton Message pleine largeur lance l'envoi`() {
        var sent = 0
        tab(ProfileConversationsView.Listing(interactionsDisabled = false, showsMessageButton = true), rows, onSend = { sent++ })

        compose.onNodeWithText(context.getString(R.string.profile_action_send_message)).performClick()

        assertThat(sent).isEqualTo(1)
    }
}
