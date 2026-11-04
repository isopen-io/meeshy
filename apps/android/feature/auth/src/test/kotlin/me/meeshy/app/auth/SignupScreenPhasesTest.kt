package me.meeshy.app.auth

import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.auth.LoginHandoffs
import me.meeshy.sdk.auth.RegisterOutcome
import me.meeshy.sdk.locale.DeviceLocaleProvider
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.MeeshyUser
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
 * L'inscription en phases, vue de l'écran : l'adresse n'existe pas sans numéro plausible, la
 * carte vient ensuite, et le bouton principal part avec ce qui est montré.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SignupScreenPhasesTest {

    @get:Rule
    val compose = createComposeRule()

    @Before
    fun setUp() { Dispatchers.setMain(UnconfinedTestDispatcher()) }

    @After
    fun tearDown() { Dispatchers.resetMain() }

    private class Rig(
        val viewModel: SignupViewModel,
        val repository: AuthRepository,
        val handoffs: LoginHandoffs,
    )

    private fun rig(): Rig {
        val repository = mockk<AuthRepository>()
        coEvery { repository.register(any()) } returns NetworkResult.Success(
            RegisterOutcome.Created(AuthSession(MeeshyUser(id = "u1", username = "ada"), token = "jwt")),
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
        )
        return Rig(viewModel, repository, handoffs)
    }

    private fun show(rig: Rig, onClose: () -> Unit = {}, onRegistered: () -> Unit = {}) {
        compose.setContent {
            MeeshyTheme { SignupScreen(onClose = onClose, onRegistered = onRegistered, viewModel = rig.viewModel) }
        }
        compose.waitForIdle()
    }

    private fun typePhone(text: String) {
        compose.onNodeWithTag(SIGNUP_PHONE_FIELD_TAG).performTextInput(text)
        compose.waitForIdle()
    }

    private fun typeEmail(text: String) {
        compose.onNode(hasSetTextAction() and hasAnyAncestor(hasTestTag(SIGNUP_EMAIL_TAG))).performTextInput(text)
        compose.waitForIdle()
    }

    @Test
    fun `the address and the card are hidden until a plausible number exists`() {
        show(rig())

        compose.onNodeWithTag(SIGNUP_PHONE_FIELD_TAG).assertExists()
        compose.onNodeWithTag(SIGNUP_EMAIL_TAG).assertDoesNotExist()
        compose.onNodeWithTag(SIGNUP_CARD_TAG).assertDoesNotExist()

        typePhone("12345")
        compose.onNodeWithTag(SIGNUP_EMAIL_TAG).assertDoesNotExist()
    }

    @Test
    fun `a plausible number reveals the address, then a coherent address reveals the card`() {
        show(rig())

        typePhone("0612345678")
        compose.onNodeWithTag(SIGNUP_EMAIL_TAG).assertExists()
        compose.onNodeWithTag(SIGNUP_CARD_TAG).assertDoesNotExist()

        typeEmail("ada@meeshy.me")
        compose.onNodeWithTag(SIGNUP_CARD_TAG).assertExists()
        compose.onNodeWithTag(SIGNUP_USERNAME_TAG).assertTextContains("ada")
    }

    @Test
    fun `the primary button sends the account once the card and a ready form are there`() {
        val rig = rig()
        var registered = false
        show(rig, onRegistered = { registered = true })
        typePhone("0612345678")
        typeEmail("ada@meeshy.me")
        assertThat(rig.viewModel.state.value.canSubmit).isTrue()

        compose.onNodeWithTag(SIGNUP_PRIMARY_TAG).performScrollTo().performClick()
        compose.waitForIdle()

        coVerify(exactly = 1) { rig.repository.register(any()) }
        assertThat(registered).isTrue()
    }

    @Test
    fun `touching the inactive button sends nothing and explains the missing number`() {
        val rig = rig()
        show(rig)

        compose.onNodeWithTag(SIGNUP_PRIMARY_TAG).performScrollTo().performClick()
        compose.waitForIdle()

        coVerify(exactly = 0) { rig.repository.register(any()) }
        compose.onNodeWithTag(SIGNUP_PHONE_ERROR_TAG).assertExists()
    }

    @Test
    fun `already have an account hands the typed address to the sign-in screen and closes`() {
        val rig = rig()
        var closed = false
        show(rig, onClose = { closed = true })
        typePhone("0612345678")
        typeEmail("ada@meeshy.me")

        compose.onNodeWithTag(SIGNUP_SIGN_IN_TAG).performScrollTo().performClick()
        compose.waitForIdle()

        assertThat(closed).isTrue()
        assertThat(rig.handoffs.signupEmail.take()).isEqualTo("ada@meeshy.me")
    }
}
