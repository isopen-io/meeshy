package me.meeshy.app.onboarding

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import java.util.Locale
import me.meeshy.sdk.game.OnboardingPresence
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.media.MediaPermissionState
import me.meeshy.sdk.model.onboarding.ApiOnboardingState
import me.meeshy.sdk.model.onboarding.OnboardingStepId
import me.meeshy.sdk.model.onboarding.OnboardingStepOutcome
import me.meeshy.sdk.model.onboarding.OnboardingSuggestion
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

private class LayerGateway(var served: ApiOnboardingState? = ApiOnboardingState(eligible = true)) : OnboardingGateway {
    val settled = mutableSetOf<String>()
    override suspend fun fetchState() = served
    override suspend fun record(step: OnboardingStepId, outcome: OnboardingStepOutcome) = Unit
    override suspend fun finish() = Unit
    override suspend fun updateLanguages(primary: String, secondary: String?) = true
    override suspend fun resendVerification(email: String) = true
    override suspend fun declareBirthDate(pickerUtcMillis: Long): OnboardingBirthDateResult =
        OnboardingBirthDateResult.Declared(closesGlobal = false)
    override suspend fun sendGreeting(conversationId: String, text: String, declaredLanguage: String?) = true
    override suspend fun sendFriendRequest(userId: String) = true
    override suspend fun findFriendsInContacts(selfId: String?): List<OnboardingSuggestion>? = emptyList()
    override suspend fun fetchProgress(): OnboardingProgress? = null
    override suspend fun contactsPermission() = MediaPermissionState.NOT_DETERMINED
    override suspend fun notificationsUndetermined() = false
    override fun isSettled(userId: String) = userId in settled
    override fun markSettled(userId: String) { settled += userId }
}

private object LayerTexts : OnboardingTexts {
    override val locale: Locale = Locale.FRENCH
    override fun greetingTemplate(index: Int) = "Salut %1\$s %2\$s"
    override fun languageName(code: String) = code
    override fun join(names: List<String>) = names.joinToString("+")
}

private val ada = MeeshyUser(id = "u1", username = "ada", displayName = "Ada", email = "ada@example.com", systemLanguage = "fr")

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w411dp-h891dp")
class OnboardingLayerTest {

    @get:Rule
    val compose = createComposeRule()

    private fun mount(
        gateway: LayerGateway = LayerGateway(),
        presence: OnboardingPresence = OnboardingPresence(),
        user: MeeshyUser? = ada,
        composerOpen: Boolean = false,
    ): Pair<OnboardingPresence, OnboardingViewModel> {
        val model = OnboardingViewModel(gateway, LayerTexts).apply { pause = { } }
        compose.setContent {
            MeeshyTheme {
                OnboardingLayer(
                    viewModel = model,
                    presence = presence,
                    user = user,
                    isRoutedElsewhere = false,
                    isCelebrating = false,
                    isStoryComposerOpen = composerOpen,
                    navigation = OnboardingNavigation(),
                )
            }
        }
        compose.waitForIdle()
        return presence to model
    }

    @Test
    fun `au premier lancement le calque s'affiche et l'onboarding se publie present`() {
        val (presence, _) = mount()

        compose.onNodeWithTag(ONBOARDING_OVERLAY_TAG).assertExists()
        assertThat(presence.isPresented.value).isTrue()
    }

    @Test
    fun `un parcours deja regle ne s'affiche pas et ne se publie pas`() {
        val gateway = LayerGateway().apply { settled += "u1" }
        val (presence, _) = mount(gateway)

        compose.onNodeWithTag(ONBOARDING_OVERLAY_TAG).assertDoesNotExist()
        assertThat(presence.isPresented.value).isFalse()
    }

    @Test
    fun `sans utilisateur connu rien ne demarre`() {
        val (presence, _) = mount(user = null)

        compose.onNodeWithTag(ONBOARDING_OVERLAY_TAG).assertDoesNotExist()
        assertThat(presence.isPresented.value).isFalse()
    }

    @Test
    fun `Tout passer ferme le calque et libere la revelation d'un palier`() {
        val (presence, _) = mount()

        compose.onNodeWithTag(ONBOARDING_SKIP_ALL_TAG).performClick()
        compose.waitForIdle()

        compose.onNodeWithTag(ONBOARDING_OVERLAY_TAG).assertDoesNotExist()
        assertThat(presence.isPresented.value).isFalse()
    }

    @Test
    fun `le composeur de story ouvert efface le calque sans mettre fin au parcours`() {
        val (presence, _) = mount(composerOpen = true)

        compose.onNodeWithTag(ONBOARDING_OVERLAY_TAG).assertDoesNotExist()
        assertThat(presence.isPresented.value).isTrue()
    }
}
