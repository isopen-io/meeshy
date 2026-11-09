package me.meeshy.app.onboarding

import android.content.Context
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.ImageUploadTarget
import me.meeshy.sdk.model.onboarding.OnboardingCard
import me.meeshy.sdk.model.onboarding.OnboardingProfileCard
import me.meeshy.sdk.model.onboarding.OnboardingStepId
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w411dp-h891dp")
class OnboardingProfileStepCardTest {

    @get:Rule
    val compose = createComposeRule()

    private val context: Context = RuntimeEnvironment.getApplication()

    private fun profileState(card: OnboardingProfileCard = OnboardingProfileCard()) = OnboardingUiState(
        card = OnboardingCard.Step(OnboardingStepId.PROFILE),
        userDisplayName = "Ada",
        userHandle = "ada",
        profileCard = card,
    )

    private fun show(state: OnboardingUiState, actions: OnboardingCardActions = OnboardingCardActions()) {
        compose.setContent {
            MeeshyTheme { OnboardingCardContent(state = state, actions = actions, reduceMotion = true) }
        }
        compose.waitForIdle()
    }

    @Test
    fun `la carte conseille de se montrer et apercoit le profil`() {
        show(profileState())

        compose.onNodeWithText(context.getString(R.string.onboarding_profile_title)).assertExists()
        compose.onNodeWithText(context.getString(R.string.onboarding_profile_benefit_visibility)).assertExists()
        compose.onNodeWithText(context.getString(R.string.onboarding_profile_benefit_contacts)).assertExists()
        compose.onNodeWithText("@ada").assertExists()
    }

    @Test
    fun `toucher la banniere ou l'avatar ouvre le choix de l'image correspondante`() {
        val chosen = mutableListOf<ImageUploadTarget>()
        show(profileState(), OnboardingCardActions(chooseProfileImage = { chosen += it }))

        compose.onNodeWithContentDescription(context.getString(R.string.onboarding_profile_banner_a11y)).performClick()
        compose.onNodeWithContentDescription(context.getString(R.string.onboarding_profile_avatar_a11y)).performClick()

        assertThat(chosen).containsExactly(ImageUploadTarget.BANNER, ImageUploadTarget.AVATAR).inOrder()
    }

    @Test
    fun `rien de pose - le geste principal dit Plus tard, sans second bouton`() {
        var left = 0
        show(profileState(), OnboardingCardActions(continueFromProfile = { left++ }))

        compose.onNodeWithText(context.getString(R.string.onboarding_later)).assertExists()
        compose.onNodeWithTag("onboarding.later").assertDoesNotExist()
        compose.onNodeWithTag("onboarding.profile.primary").performClick()
        assertThat(left).isEqualTo(1)
    }

    @Test
    fun `une image posee - Continuer, et Plus tard passe en second`() {
        val posed = OnboardingProfileCard().uploaded(ImageUploadTarget.AVATAR, "https://cdn/a.jpg")
        show(profileState(posed))

        compose.onNodeWithText(context.getString(R.string.onboarding_card_continue)).assertExists()
        compose.onNodeWithTag("onboarding.later").assertExists()
    }

    @Test
    fun `une image en cours d'envoi propose deja Continuer`() {
        show(profileState(OnboardingProfileCard().picked(ImageUploadTarget.BANNER, "/x.jpg")))

        compose.onNodeWithText(context.getString(R.string.onboarding_card_continue)).assertExists()
        compose.onNodeWithTag("onboarding.later").assertExists()
    }

    @Test
    fun `un echec se dit et Reessayer relance la meme image`() {
        var retried = 0
        val failed = OnboardingProfileCard().picked(ImageUploadTarget.BANNER, "/x.jpg").failed(ImageUploadTarget.BANNER)
        show(profileState(failed), OnboardingCardActions(retryFailedProfileImages = { retried++ }))

        compose.onNodeWithText(context.getString(R.string.onboarding_profile_failed)).assertExists()
        compose.onNodeWithTag("onboarding.profile.retry").performClick()
        assertThat(retried).isEqualTo(1)
    }
}
