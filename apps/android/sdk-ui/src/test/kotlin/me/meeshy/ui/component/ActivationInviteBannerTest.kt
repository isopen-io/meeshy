package me.meeshy.ui.component

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ActivationInvite
import me.meeshy.sdk.model.UserActivation
import me.meeshy.sdk.model.UserActivationRules
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ActivationInviteBannerTest {

    @get:Rule
    val compose = createComposeRule()

    private val now = 1_000_000L

    private fun inviteFor(phase: UserActivation.Phase): ActivationInvite? =
        UserActivationRules.invite(
            UserActivation(phase, "1970-01-12T00:00:00.000Z", listOf(UserActivation.Channel.EMAIL)),
            now,
        )

    private fun show(invite: ActivationInvite?, onOpen: () -> Unit = {}, onDismiss: () -> Unit = {}) {
        compose.setContent {
            MeeshyTheme {
                ActivationInviteBanner(
                    invite = invite,
                    title = "Validez votre compte",
                    message = "Il vous reste 10 jours",
                    dismissLabel = "Plus tard",
                    onOpen = onOpen,
                    onDismiss = onDismiss,
                )
            }
        }
    }

    @Test
    fun `the banner shows during the invite phase`() {
        show(inviteFor(UserActivation.Phase.INVITE))

        compose.onNodeWithText("Validez votre compte").assertIsDisplayed()
    }

    @Test
    fun `the banner is absent in the quiet phase`() {
        show(inviteFor(UserActivation.Phase.QUIET))

        compose.onNodeWithText("Validez votre compte").assertDoesNotExist()
    }

    @Test
    fun `the banner is absent once the account is validated`() {
        show(inviteFor(UserActivation.Phase.DONE))

        compose.onNodeWithText("Validez votre compte").assertDoesNotExist()
    }

    @Test
    fun `the banner is absent in the blocked phase`() {
        show(inviteFor(UserActivation.Phase.BLOCKED))

        compose.onNodeWithText("Validez votre compte").assertDoesNotExist()
    }

    @Test
    fun `tapping opens and dismissing is a separate gesture`() {
        var opened = 0
        var dismissed = 0
        show(inviteFor(UserActivation.Phase.INVITE), onOpen = { opened++ }, onDismiss = { dismissed++ })

        compose.onNodeWithText("Validez votre compte").performClick()
        compose.onNodeWithText("Plus tard").performClick()

        assertThat(opened).isEqualTo(1)
        assertThat(dismissed).isEqualTo(1)
    }
}
