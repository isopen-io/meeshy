package me.meeshy.app.conversations

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.InviteLinkDefaults
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class InviteFriendsSheetTest {

    @get:Rule
    val compose = createComposeRule()

    private val events = mutableListOf<InviteFriendsUiEvent>()
    private val info = InviteConversationInfo(name = "Les amis", memberCount = 4, type = "group")
    private val texts = InviteTexts("Rejoins-moi", "Rejoins la conversation \"Les amis\"")

    private fun ready(showOptions: Boolean = false, copied: Boolean = false): InviteFriendsUiState {
        val draft = InviteLinkDefaults.draft("c1")
        return InviteFriendsUiState(
            draft = draft,
            generated = draft,
            joinUrl = "https://meeshy.me/chat/abc",
            showOptions = showOptions,
            copied = copied,
        )
    }

    private fun render(state: InviteFriendsUiState) {
        compose.setContent {
            MeeshyTheme {
                InviteFriendsContent(state, info, texts, MeeshyPalette.Indigo500, onEvent = { events += it })
            }
        }
    }

    @Test
    fun `la phase un montre la carte, le lien, le resume et le bouton Partager`() {
        render(ready())
        compose.onNodeWithText("Les amis").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("https://meeshy.me/chat/abc").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Share").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Customise the options").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun `toucher Partager emet l'evenement de partage`() {
        render(ready())
        compose.onNodeWithText("Share").performScrollTo().performClick()
        assertThat(events).containsExactly(InviteFriendsUiEvent.Share)
    }

    @Test
    fun `toucher Copier emet la copie et l'etat copie change le libelle`() {
        render(ready())
        compose.onNodeWithText("Copy").performScrollTo().performClick()
        assertThat(events).containsExactly(InviteFriendsUiEvent.Copy)
    }

    @Test
    fun `l'etat copie affiche Copie`() {
        render(ready(copied = true))
        compose.onNodeWithText("Copied!").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun `Personnaliser deplie les sections d'options`() {
        render(ready())
        compose.onNodeWithText("Customise the options").performScrollTo().performClick()
        assertThat(events).containsExactly(InviteFriendsUiEvent.ToggleOptions)
    }

    @Test
    fun `la phase deux montre identite, limites, permissions et acces`() {
        render(ready(showOptions = true))
        listOf("IDENTITY", "LIMITS", "PERMISSIONS", "ACCESS").forEach { title ->
            compose.onNodeWithText(title).performScrollTo().assertIsDisplayed()
        }
    }

    @Test
    fun `sans lien et en creation le bouton Partager est inactif`() {
        val draft = InviteLinkDefaults.draft("c1")
        render(InviteFriendsUiState(draft = draft, isCreating = true))
        compose.onNodeWithText("Share").assertIsNotEnabled()
    }
}
