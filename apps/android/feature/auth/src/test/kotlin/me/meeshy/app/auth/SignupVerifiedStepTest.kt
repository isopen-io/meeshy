package me.meeshy.app.auth

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.auth.SignupCardStage
import me.meeshy.sdk.model.auth.SignupProgress
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** « Compte validé ! » : le sceau, le titre, et un feu d'artifice qui se tait sous animations réduites. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SignupVerifiedStepTest {

    @get:Rule
    val compose = createComposeRule()

    private val verifiedState = SignupUiState(
        form = me.meeshy.sdk.model.auth.SignupForm.defaults(
            deviceLanguage = "en",
            deviceRegion = "US",
            supportedLanguageCodes = setOf("en", "fr"),
            knownCountryCodes = me.meeshy.sdk.model.auth.CountryCatalog.dialCodes.keys,
        ),
        progress = SignupProgress(emailShown = true, cardShown = true),
        card = SignupCard.Verified(SignupProof.CODE, null),
    )

    private fun showCard(state: SignupUiState, reduceMotion: Boolean) {
        compose.setContent {
            CompositionLocalProvider(LocalReduceMotion provides reduceMotion) {
                MeeshyTheme { SignupIdentityCard(state = state, actions = noActions()) }
            }
        }
        compose.waitForIdle()
    }

    private fun noActions() = SignupCardActions(
        onDisplayNameChange = {},
        onUsernameChange = {},
        onSuggestionPicked = {},
        onPasswordChange = {},
        onSubmit = {},
    )

    @Test
    fun `the validated card shows the seal, the title and the lead`() {
        showCard(verifiedState, reduceMotion = false)

        compose.onNodeWithTag(SIGNUP_VERIFIED_SEAL_TAG).assertIsDisplayed()
        compose.onNodeWithText("Account verified!", substring = true, ignoreCase = true).assertExists()
        compose.onNodeWithText("people read you in your language", substring = true, ignoreCase = true).assertExists()
    }

    @Test
    fun `the button of a validated account speaks to others`() {
        assertThat(verifiedState.primaryAction).isEqualTo(me.meeshy.sdk.model.auth.SignupPrimaryAction.Talk)
        assertThat(SignupCardStage.Verified).isEqualTo(verifiedState.card.stage)
    }

    @Test
    fun `fireworks play over the card by default`() {
        showCard(verifiedState, reduceMotion = false)

        compose.onNodeWithTag(SIGNUP_FIREWORKS_TAG).assertExists()
    }

    @Test
    fun `no fireworks and so no endless animation under reduced motion`() {
        showCard(verifiedState, reduceMotion = true)

        compose.onNodeWithTag(SIGNUP_FIREWORKS_TAG).assertDoesNotExist()
        compose.onNodeWithTag(SIGNUP_VERIFIED_SEAL_TAG).assertIsDisplayed()
    }

    @Test
    fun `a validated account with no session left offers to sign in`() {
        var signedIn = false
        compose.setContent {
            MeeshyTheme {
                SignupVerifiedStep(openRefused = false, needsSignIn = true, onSignIn = { signedIn = true })
            }
        }

        compose.onNodeWithTag(SIGNUP_VERIFIED_SIGN_IN_TAG).performClick()

        assertThat(signedIn).isTrue()
    }

    @Test
    fun `a refused opening is said while the card stays`() {
        compose.setContent {
            MeeshyTheme { SignupVerifiedStep(openRefused = true, needsSignIn = false, onSignIn = {}) }
        }

        compose.onNodeWithTag(SIGNUP_VERIFIED_TAG).assertIsDisplayed()
        compose.onNodeWithText("could not open its session", substring = true, ignoreCase = true).assertExists()
    }
}
