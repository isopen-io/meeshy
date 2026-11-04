package me.meeshy.app.auth

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
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
        compose.onNodeWithTag(ActivationInviteSheetTags.SEND_CODE).performClick()
        compose.onNodeWithTag(ActivationInviteSheetTags.ADD_PHONE).performClick()
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
        compose.onNodeWithText("Close").performClick()
        assertEquals(listOf<ActivationInviteEvent>(ActivationInviteEvent.Dismiss), events)
    }
}

private fun androidx.compose.ui.test.SemanticsNodeInteraction.assertDoesNotExistCompat() =
    assertDoesNotExist()
