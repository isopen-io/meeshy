package me.meeshy.app.auth

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTextInput
import androidx.compose.runtime.remember
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.auth.LoginHandoffs
import me.meeshy.sdk.auth.RegisterOutcome
import me.meeshy.sdk.locale.DeviceLocaleProvider
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.RegisterRequest
import me.meeshy.sdk.model.auth.EmailCodeDispatch
import me.meeshy.sdk.model.auth.SentEmailCode
import me.meeshy.sdk.model.net.MaskedEmailOwner
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.notification.InMemoryPushPermissionDeferralStore
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * « Est-ce vous ? » : l'adresse refusée comme déjà utilisée offre le titulaire masqué et deux issues, et ces gestes
 * ne valent que pour CETTE adresse.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SignupEmailTakenTest {

    @get:Rule
    val compose = createComposeRule()

    @Before
    fun setUp() { Dispatchers.setMain(UnconfinedTestDispatcher()) }

    @After
    fun tearDown() { Dispatchers.resetMain() }

    private val owner = MaskedEmailOwner("A••• L•••", "ad•••", null)

    private class Rig(
        val viewModel: SignupViewModel,
        val repository: AuthRepository,
        val handoffs: LoginHandoffs,
    )

    private fun rig(takenOwner: MaskedEmailOwner? = owner): Rig {
        val repository = mockk<AuthRepository>()
        coEvery { repository.register(any()) } returns NetworkResult.Failure(
            ApiError(message = "taken", code = "EMAIL_TAKEN", fieldName = "email", emailOwner = takenOwner),
        )
        val handoffs = LoginHandoffs()
        val viewModel = SignupViewModel(
            repository,
            mockk(relaxed = true),
            object : DeviceLocaleProvider {
                override fun languageTag(): String = "en"
                override fun regionTag(): String = "US"
            },
            InMemoryPushPermissionDeferralStore(),
            loginHandoffs = handoffs,
            provenSessions = provenOpener(),
            celebration = arrivalCelebration(),
        ).apply {
            onDisplayNameChange("Ada Lovelace")
            onEmailChange("ada@meeshy.me")
            onPhoneEntryChange("0612345678")
            register()
        }
        return Rig(viewModel, repository, handoffs)
    }

    private fun show(rig: Rig) {
        compose.setContent {
            MeeshyTheme {
                SignupScreen(
                    onClose = {},
                    onRegistered = {},
                    viewModel = rig.viewModel,
                    codeEntry = { remember { EmailVerificationViewModel(mockk(relaxed = true), mockk(relaxed = true)) } },
                )
            }
        }
        compose.waitForIdle()
    }

    // ---- ViewModel ----------------------------------------------------------

    @Test
    fun `the refused address carries its masked owner and shows the gestures`() {
        val state = rig().viewModel.state.value

        assertThat(state.showsEmailTakenActions).isTrue()
        assertThat(state.emailTaken?.owner).isEqualTo(owner)
    }

    @Test
    fun `a gateway that serves no owner still offers the recovery`() {
        val state = rig(takenOwner = null).viewModel.state.value

        assertThat(state.showsEmailTakenActions).isTrue()
        assertThat(state.emailTaken?.owner).isNull()
    }

    @Test
    fun `correcting the address removes the gestures but another field does not`() {
        val viewModel = rig().viewModel

        viewModel.onDisplayNameChange("Ada")
        assertThat(viewModel.state.value.showsEmailTakenActions).isTrue()

        viewModel.onEmailChange("ada@meeshy.fr")
        assertThat(viewModel.state.value.showsEmailTakenActions).isFalse()

        viewModel.onEmailChange("ada@meeshy.me")
        assertThat(viewModel.state.value.showsEmailTakenActions).isTrue()
    }

    @Test
    fun `its me sends the code and the link then opens the waiting`() = runTest {
        val rig = rig()
        val dispatch = EmailCodeDispatch(expiresInSeconds = 600, pendingSessionToken = "pend")
        coEvery { rig.repository.requestEmailCode("ada@meeshy.me") } returns NetworkResult.Success(dispatch)

        rig.viewModel.requestSignInLink()

        assertThat(rig.viewModel.effect.first()).isEqualTo(SignupEffect.OpenSignInLink)
        assertThat(rig.handoffs.sentEmailCode.take()).isEqualTo(SentEmailCode("ada@meeshy.me", dispatch))
        assertThat(rig.viewModel.state.value.signInLinkFailure).isNull()
    }

    @Test
    fun `a failed link is said under the gesture and opens nothing`() {
        val rig = rig()
        coEvery { rig.repository.requestEmailCode(any()) } returns
            NetworkResult.Failure(ApiError(message = "down", code = "NETWORK"))

        rig.viewModel.requestSignInLink()

        assertThat(rig.viewModel.state.value.signInLinkFailure).isEqualTo(SignInLinkFailure.NETWORK)
        assertThat(rig.handoffs.sentEmailCode.take()).isNull()
        assertThat(rig.viewModel.state.value.globalError).isNull()
    }

    @Test
    fun `not me replays the signup claiming the address and awaits the code without a session`() {
        val rig = rig()
        val sent = slot<RegisterRequest>()
        coEvery { rig.repository.register(capture(sent)) } returns
            NetworkResult.Success(RegisterOutcome.VerificationRequired("ada@meeshy.me", "pend"))

        rig.viewModel.claimEmail()

        assertThat(sent.captured.claimEmail).isTrue()
        val card = rig.viewModel.state.value.card as SignupCard.AwaitingCode
        assertThat(card.step.signedIn).isFalse()
        assertThat(card.step.email).isEqualTo("ada@meeshy.me")
        assertThat(card.step.pendingSessionToken).isEqualTo("pend")
        assertThat(rig.viewModel.state.value.showsEmailTakenActions).isFalse()
    }

    @Test
    fun `not me on an address freed meanwhile signs the new account in through the storing register`() {
        val rig = rig()
        coEvery { rig.repository.register(match { it.claimEmail == true }) } returns
            NetworkResult.Success(RegisterOutcome.Created(AuthSession(MeeshyUser(id = "u1", username = "ada"), token = "jwt")))

        rig.viewModel.claimEmail()

        coVerify(exactly = 0) { rig.repository.registerHoldingSession(any()) }
        coVerify { rig.repository.register(match { it.claimEmail == true }) }
        assertThat(rig.viewModel.state.value.isRegistered).isTrue()
    }

    @Test
    fun `forgot password hands the refused address over and asks the sheet`() = runTest {
        val rig = rig()

        rig.viewModel.onForgotPassword()

        assertThat(rig.viewModel.effect.first()).isEqualTo(SignupEffect.OpenForgotPassword)
        assertThat(rig.handoffs.recoveryEmail.take()).isEqualTo("ada@meeshy.me")
    }

    // ---- Écran --------------------------------------------------------------

    @Test
    fun `the block asks is it you with the masked owner and both exits`() {
        show(rig())

        compose.onNodeWithTag(SIGNUP_EMAIL_TAKEN_TAG).assertExists()
        compose.onNodeWithText("A••• L•••").assertExists()
        compose.onNodeWithText("@ad•••").assertExists()
        compose.onNodeWithTag(SIGNUP_EMAIL_ITS_ME_TAG).assertExists()
        compose.onNodeWithTag(SIGNUP_EMAIL_NOT_ME_TAG).assertExists()
        compose.onNodeWithTag(SIGNUP_EMAIL_FORGOT_TAG).assertExists()
    }

    @Test
    fun `without an owner the block is the sober recovery only`() {
        show(rig(takenOwner = null))

        compose.onNodeWithTag(SIGNUP_EMAIL_ITS_ME_TAG).assertExists()
        compose.onNodeWithTag(SIGNUP_EMAIL_FORGOT_TAG).assertExists()
        compose.onNodeWithTag(SIGNUP_EMAIL_NOT_ME_TAG).assertDoesNotExist()
    }

    @Test
    fun `the block disappears when the address is corrected`() {
        show(rig())

        compose.onNode(hasSetTextAction() and hasAnyAncestor(hasTestTag(SIGNUP_EMAIL_TAG))).performTextClearance()
        compose.onNode(hasSetTextAction() and hasAnyAncestor(hasTestTag(SIGNUP_EMAIL_TAG)))
            .performTextInput("ada@meeshy.fr")
        compose.waitForIdle()

        compose.onNodeWithTag(SIGNUP_EMAIL_TAKEN_TAG).assertDoesNotExist()
    }

    @Test
    fun `tapping not me sends the claim`() {
        val rig = rig()
        coEvery { rig.repository.register(match { it.claimEmail == true }) } returns
            NetworkResult.Success(RegisterOutcome.VerificationRequired("ada@meeshy.me", null))
        show(rig)

        compose.onNodeWithTag(SIGNUP_EMAIL_NOT_ME_TAG).performScrollTo().performClick()
        compose.waitForIdle()

        coVerify { rig.repository.register(match { it.claimEmail == true }) }
        compose.onNodeWithTag(SIGNUP_CODE_STEP_TAG).assertIsDisplayed()
    }
}
