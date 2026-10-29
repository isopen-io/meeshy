package me.meeshy.app.onboarding

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.compose.LocalLifecycleOwner
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
    var fetches = 0
    override suspend fun fetchState(): ApiOnboardingState? {
        fetches += 1
        return served
    }
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

private class TestLifecycle : LifecycleOwner {
    val registry: LifecycleRegistry = LifecycleRegistry.createUnsafe(this).apply { currentState = Lifecycle.State.RESUMED }
    override val lifecycle: Lifecycle get() = registry
}

private val emailFirst = ApiOnboardingState(
    eligible = true,
    emailVerified = false,
    seenSteps = listOf(OnboardingStepId.LANGUAGES, OnboardingStepId.AGE),
)

private val ada = MeeshyUser(id = "u1", username = "ada", displayName = "Ada", email = "ada@example.com", systemLanguage = "fr")

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w411dp-h891dp")
class OnboardingLayerTest {

    @get:Rule
    val compose = createComposeRule()

    private fun mount(
        gateway: LayerGateway = LayerGateway(),
        presence: OnboardingPresence = OnboardingPresence(),
        user: MutableState<MeeshyUser?> = mutableStateOf(ada),
        composerOpen: Boolean = false,
        callOpen: MutableState<Boolean> = mutableStateOf(false),
        lifecycle: TestLifecycle = TestLifecycle(),
    ): Pair<OnboardingPresence, OnboardingViewModel> {
        val model = OnboardingViewModel(gateway, LayerTexts).apply { pause = { } }
        compose.setContent {
            CompositionLocalProvider(LocalLifecycleOwner provides lifecycle) {
                MeeshyTheme {
                    OnboardingLayer(
                        viewModel = model,
                        presence = presence,
                        user = user.value,
                        isRoutedElsewhere = false,
                        isCelebrating = false,
                        isStoryComposerOpen = composerOpen,
                        isCallOpen = callOpen.value,
                        navigation = OnboardingNavigation(),
                    )
                }
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
        val (presence, _) = mount(user = mutableStateOf(null))

        compose.onNodeWithTag(ONBOARDING_OVERLAY_TAG).assertDoesNotExist()
        assertThat(presence.isPresented.value).isFalse()
    }

    @Test
    fun `un utilisateur apparu en cours de vie de l'activite demarre le parcours et lit l'eligibilite`() {
        val gateway = LayerGateway()
        val user = mutableStateOf<MeeshyUser?>(null)
        val (presence, _) = mount(gateway, user = user)
        assertThat(gateway.fetches).isEqualTo(0)

        user.value = ada
        compose.waitForIdle()

        assertThat(gateway.fetches).isEqualTo(1)
        compose.onNodeWithTag(ONBOARDING_OVERLAY_TAG).assertExists()
        assertThat(presence.isPresented.value).isTrue()
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

    @Test
    fun `la session fermee pendant le parcours retire le calque et libere la revelation d'un palier`() {
        val user = mutableStateOf<MeeshyUser?>(ada)
        val (presence, _) = mount(user = user)

        user.value = null
        compose.waitForIdle()

        compose.onNodeWithTag(ONBOARDING_OVERLAY_TAG).assertDoesNotExist()
        assertThat(presence.isPresented.value).isFalse()
    }

    @Test
    fun `un appel ouvert passe devant le calque, qui revient a sa fin`() {
        val call = mutableStateOf(true)
        val (presence, _) = mount(callOpen = call)

        compose.onNodeWithTag(ONBOARDING_OVERLAY_TAG).assertDoesNotExist()
        assertThat(presence.isPresented.value).isTrue()

        call.value = false
        compose.waitForIdle()

        compose.onNodeWithTag(ONBOARDING_OVERLAY_TAG).assertExists()
    }

    @Test
    fun `la carte adresse relit l'etat toutes les cinq secondes au premier plan`() {
        val gateway = LayerGateway(served = emailFirst)
        mount(gateway = gateway)
        val before = gateway.fetches

        compose.mainClock.advanceTimeBy(5_100)
        compose.waitForIdle()

        assertThat(gateway.fetches).isGreaterThan(before)
    }

    @Test
    fun `en arriere-plan la carte adresse ne relit plus rien`() {
        val gateway = LayerGateway(served = emailFirst)
        val lifecycle = TestLifecycle()
        mount(gateway = gateway, lifecycle = lifecycle)

        compose.runOnIdle { lifecycle.registry.currentState = Lifecycle.State.CREATED }
        compose.waitForIdle()
        val before = gateway.fetches
        compose.mainClock.advanceTimeBy(20_000)
        compose.waitForIdle()

        assertThat(gateway.fetches).isEqualTo(before)
    }
}
