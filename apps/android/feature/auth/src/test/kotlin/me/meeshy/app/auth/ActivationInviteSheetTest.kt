package me.meeshy.app.auth

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.performSemanticsAction
import me.meeshy.sdk.model.UserActivation
import me.meeshy.sdk.model.UserActivation.Channel
import me.meeshy.sdk.model.auth.ActivationInviteState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ActivationInviteSheetTest {
    @get:Rule
    val compose = createComposeRule()

    private fun state(
        missing: List<Channel> = listOf(Channel.EMAIL, Channel.PHONE),
        proven: List<Channel> = emptyList(),
        daysLeft: Int? = null,
        emailSent: Boolean = false,
    ) = ActivationInviteUiState(
        invite = ActivationInviteState(
            activation = UserActivation(UserActivation.Phase.INVITE, null, missing),
            email = "ana@meeshy.me",
            proven = proven,
            isPresented = true,
        ),
        daysLeft = daysLeft,
        emailSent = emailSent,
    )

    private fun show(state: ActivationInviteUiState, events: MutableList<ActivationInviteEvent> = mutableListOf()) {
        compose.setContent { MeeshyTheme { ActivationInviteSheet(state = state, onEvent = { events += it }) } }
    }

    @Test
    fun `les deux etapes sont offertes tant que tout manque`() {
        show(state())
        compose.onNodeWithTag(ActivationInviteSheetTags.SEND_CODE).assertIsDisplayed()
        compose.onNodeWithTag(ActivationInviteSheetTags.ADD_PHONE).assertIsDisplayed()
        compose.onNodeWithText("Later").assertIsDisplayed()
    }

    @Test
    fun `l'accroche suit les jours restants`() {
        show(state(daysLeft = 1))
        compose.onNodeWithText("You have 1 day left to verify your account. After that, signing in will require a code.").assertIsDisplayed()
    }

    @Test
    fun `recevoir le code et ajouter le numero emettent leurs evenements`() {
        val events = mutableListOf<ActivationInviteEvent>()
        show(state(), events)
        compose.onNodeWithTag(ActivationInviteSheetTags.SEND_CODE).tap()
        compose.onNodeWithTag(ActivationInviteSheetTags.ADD_PHONE).tap()
        assertEquals(listOf(ActivationInviteEvent.SendCode, ActivationInviteEvent.AddPhone), events)
    }

    @Test
    fun `une fois le code envoye la saisie a six chiffres remplace le bouton`() {
        show(state(emailSent = true))
        compose.onNodeWithText("Code sent to ana@meeshy.me. Enter it below.").assertIsDisplayed()
        compose.onNodeWithText("Verify").assertIsDisplayed()
        compose.onNodeWithTag(ActivationInviteSheetTags.SEND_CODE).assertDoesNotExistCompat()
    }

    @Test
    fun `tout prouve le message final apparait et Plus tard devient Fermer`() {
        val events = mutableListOf<ActivationInviteEvent>()
        show(state(missing = emptyList(), proven = listOf(Channel.EMAIL, Channel.PHONE)), events)
        compose.onNodeWithText("Your account is verified. Thank you!").assertIsDisplayed()
        compose.onNodeWithText("Email verified ✓").assertIsDisplayed()
        compose.onNodeWithText("Number verified ✓").assertIsDisplayed()
        compose.onNodeWithText("Close").tap()
        assertEquals(listOf<ActivationInviteEvent>(ActivationInviteEvent.Dismiss), events)
    }
}

private fun androidx.compose.ui.test.SemanticsNodeInteraction.assertDoesNotExistCompat() =
    assertDoesNotExist()

/**
 * La feuille est une `ModalBottomSheet` : sous Robolectric, un toucher injecté n'atteint pas les enfants de sa fenêtre
 * (le geste n'est pas en cause, la feuille vit dans une autre fenêtre). Le témoin déclenche donc l'action sémantique
 * `OnClick` — celle que TalkBack déclenche aussi — plutôt qu'un toucher.
 */
private fun androidx.compose.ui.test.SemanticsNodeInteraction.tap() = performSemanticsAction(SemanticsActions.OnClick)
