package me.meeshy.app.onboarding

import com.google.common.truth.Truth.assertThat
import java.time.LocalDate
import java.util.Locale
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.media.MediaPermissionState
import me.meeshy.sdk.model.onboarding.ApiOnboardingState
import me.meeshy.sdk.model.onboarding.OnboardingAgeState
import me.meeshy.sdk.model.onboarding.OnboardingCard
import me.meeshy.sdk.model.onboarding.OnboardingStepId
import me.meeshy.sdk.model.onboarding.OnboardingStepOutcome
import me.meeshy.sdk.model.onboarding.OnboardingStepRewards
import me.meeshy.sdk.model.onboarding.OnboardingSuggestion
import me.meeshy.sdk.model.BirthDateDeclarationError
import org.junit.Test

private class SessionGateway : OnboardingGateway {
    var served: ApiOnboardingState? = ApiOnboardingState(eligible = true)
    var fetches = 0
    var sending: Set<String>? = null
    val settled = mutableSetOf<String>()
    val recorded = mutableListOf<Pair<OnboardingStepId, OnboardingStepOutcome>>()
    var birthResult: OnboardingBirthDateResult = OnboardingBirthDateResult.Declared(closesGlobal = false)

    override suspend fun fetchState(): ApiOnboardingState? {
        fetches += 1
        return served
    }
    override suspend fun record(step: OnboardingStepId, outcome: OnboardingStepOutcome) {
        recorded += step to outcome
    }
    override suspend fun finish() = Unit
    override suspend fun updateLanguages(primary: String, secondary: String?) = true
    override suspend fun resendVerification(email: String) = true
    override suspend fun declareBirthDate(pickerUtcMillis: Long) = birthResult
    override suspend fun sendGreeting(conversationId: String, text: String, declaredLanguage: String?) = true
    override suspend fun sendFriendRequest(userId: String) = true
    override suspend fun findFriendsInContacts(selfId: String?): List<OnboardingSuggestion>? = emptyList()
    override suspend fun fetchProgress(): OnboardingProgress? = null
    override suspend fun contactsPermission() = MediaPermissionState.NOT_DETERMINED
    override suspend fun notificationsUndetermined() = false
    override suspend fun sendingStoryPublications(): Set<String>? = sending
    override fun isSettled(userId: String) = userId in settled
    override fun markSettled(userId: String) { settled += userId }
}

private object SessionTexts : OnboardingTexts {
    override val locale: Locale = Locale.FRENCH
    override fun greetingTemplate(index: Int) = "Salut, moi c'est %1\$s, je parle %2\$s."
    override fun languageName(code: String) = code
    override fun join(names: List<String>) = names.joinToString("+")
}

private val ada = MeeshyUser(id = "u1", username = "ada", displayName = "Ada", email = "ada@example.com", systemLanguage = "fr")
private val bob = MeeshyUser(id = "u2", username = "bob", displayName = "Bob", email = "bob@example.com", systemLanguage = "en")

private fun sessionModel(gateway: SessionGateway) = OnboardingViewModel(gateway, SessionTexts).apply {
    pause = { }
    pickTemplate = { 0 }
    today = { LocalDate.of(2026, 10, 27) }
}

private val storyFirst = ApiOnboardingState(
    eligible = true,
    seenSteps = listOf(OnboardingStepId.LANGUAGES, OnboardingStepId.AGE, OnboardingStepId.EMAIL, OnboardingStepId.GLOBAL),
    stepRewards = OnboardingStepRewards(14, 10, 7),
)

class OnboardingSessionTest {

    @Test
    fun `a second start for the same account keeps the card and the choices already made`() = runTest {
        val gateway = SessionGateway()
        val vm = sessionModel(gateway)
        vm.start(ada)
        vm.selectPrimaryLanguage("es")
        vm.editGreeting("Hola")

        vm.start(ada)

        assertThat(vm.state.value.card).isEqualTo(OnboardingCard.Step(OnboardingStepId.LANGUAGES))
        assertThat(vm.state.value.primaryLanguage).isEqualTo("es")
        assertThat(vm.state.value.greetingDraft).isEqualTo("Hola")
        assertThat(gateway.fetches).isEqualTo(1)
    }

    @Test
    fun `a closed session takes the overlay down and forgets the parcours`() = runTest {
        val vm = sessionModel(SessionGateway())
        vm.start(ada)
        vm.editGreeting("Salut à tous")

        vm.sessionEnded()

        assertThat(vm.state.value.isPresented).isFalse()
        assertThat(vm.state.value.card).isNull()
        assertThat(vm.state.value.greetingDraft).isEmpty()
    }

    @Test
    fun `the next account starts from a blank parcours, never from the previous one`() = runTest {
        val gateway = SessionGateway()
        val vm = sessionModel(gateway)
        vm.start(ada)
        vm.later()
        vm.sessionEnded()

        vm.start(bob)

        assertThat(vm.state.value.isPresented).isTrue()
        assertThat(vm.state.value.card).isEqualTo(OnboardingCard.Step(OnboardingStepId.LANGUAGES))
        assertThat(vm.state.value.userDisplayName).isEqualTo("Bob")
        assertThat(vm.state.value.primaryLanguage).isEqualTo("en")
    }

    @Test
    fun `an account switch without a visible sign-out still never shows the previous account's cards`() = runTest {
        val vm = sessionModel(SessionGateway())
        vm.start(ada)
        vm.editGreeting("Message d'Ada")

        vm.start(bob)

        assertThat(vm.state.value.userDisplayName).isEqualTo("Bob")
        assertThat(vm.state.value.greetingDraft).doesNotContain("Ada")
    }

    @Test
    fun `the sign-out asked under 13 is not asked again once the session is closed`() = runTest {
        val gateway = SessionGateway().apply {
            served = ApiOnboardingState(eligible = true, seenSteps = listOf(OnboardingStepId.LANGUAGES), servesAgeStep = true)
            birthResult = OnboardingBirthDateResult.Refused(BirthDateDeclarationError.BELOW_MINIMUM_AGE)
        }
        val vm = sessionModel(gateway)
        vm.start(ada)
        vm.pickBirthDate(LocalDate.of(2018, 1, 1))
        vm.declareBirthDate()
        assertThat(vm.state.value.ageState).isEqualTo(OnboardingAgeState.REFUSED)
        vm.acknowledgeAgeRefusal()
        assertThat(vm.state.value.signOutRequested).isTrue()

        vm.sessionEnded()

        assertThat(vm.state.value.signOutRequested).isFalse()
        assertThat(gateway.settled).isEmpty()
    }

    @Test
    fun `closing a story composer opened outside the parcours asks the server nothing`() = runTest {
        val gateway = SessionGateway().apply { settled += "u1" }
        val vm = sessionModel(gateway)
        vm.start(ada)

        vm.storyComposerClosed()

        assertThat(gateway.fetches).isEqualTo(0)
    }

    @Test
    fun `a story that reaches the server after the composer closed is credited at the next read`() = runTest {
        val gateway = SessionGateway().apply { served = storyFirst }
        val vm = sessionModel(gateway)
        vm.start(ada)
        assertThat(vm.state.value.card).isEqualTo(OnboardingCard.Step(OnboardingStepId.STORY))

        vm.storyComposerClosed()
        assertThat(vm.state.value.storyState).isEqualTo(OnboardingStoryState.IDLE)
        assertThat(vm.state.value.storyAwaitsPublication).isTrue()

        gateway.served = storyFirst.copy(prefilledSteps = listOf(OnboardingStepId.STORY))
        vm.refreshVerification()

        assertThat(vm.state.value.storyState).isEqualTo(OnboardingStoryState.PUBLISHED)
        assertThat(vm.state.value.storyAwaitsPublication).isFalse()
        assertThat(vm.state.value.storyReward).isEqualTo(10)
        assertThat(gateway.recorded).containsExactly(OnboardingStepId.STORY to OnboardingStepOutcome.DONE)
    }

    @Test
    fun `no story is awaited before the composer has closed once`() = runTest {
        val gateway = SessionGateway().apply { served = storyFirst }
        val vm = sessionModel(gateway)
        vm.start(ada)

        gateway.served = storyFirst.copy(prefilledSteps = listOf(OnboardingStepId.STORY))
        vm.refreshVerification()

        assertThat(vm.state.value.storyAwaitsPublication).isFalse()
        assertThat(vm.state.value.storyState).isEqualTo(OnboardingStoryState.IDLE)
    }

    @Test
    fun `a composer closed on a publication that is still leaving makes the card wait for it`() = runTest {
        val gateway = SessionGateway().apply { served = storyFirst; sending = emptySet() }
        val vm = sessionModel(gateway)
        vm.start(ada)
        vm.storyComposerOpened()

        gateway.sending = setOf("cmid-1")
        vm.storyComposerClosed()

        assertThat(vm.state.value.storyAwaitsPublication).isTrue()
    }

    @Test
    fun `a composer closed without publishing waits for nothing and the card keeps its gesture`() = runTest {
        val gateway = SessionGateway().apply { served = storyFirst; sending = emptySet() }
        val vm = sessionModel(gateway)
        vm.start(ada)
        vm.storyComposerOpened()

        vm.storyComposerClosed()

        assertThat(vm.state.value.storyAwaitsPublication).isFalse()
    }

    @Test
    fun `a publication that was already leaving before the composer opened is not this composer's`() = runTest {
        val gateway = SessionGateway().apply { served = storyFirst; sending = setOf("older") }
        val vm = sessionModel(gateway)
        vm.start(ada)
        vm.storyComposerOpened()

        vm.storyComposerClosed()

        assertThat(vm.state.value.storyAwaitsPublication).isFalse()
    }

    @Test
    fun `a publication delivered before the composer's close is still credited`() = runTest {
        val gateway = SessionGateway().apply { served = storyFirst; sending = emptySet() }
        val vm = sessionModel(gateway)
        vm.start(ada)
        vm.storyComposerOpened()

        gateway.served = storyFirst.copy(prefilledSteps = listOf(OnboardingStepId.STORY))
        vm.storyComposerClosed()

        assertThat(vm.state.value.storyState).isEqualTo(OnboardingStoryState.PUBLISHED)
    }

    @Test
    fun `a publication that gave up before the server saw it hands the card its gesture back`() = runTest {
        val gateway = SessionGateway().apply { served = storyFirst; sending = emptySet() }
        val vm = sessionModel(gateway)
        vm.start(ada)
        vm.storyComposerOpened()
        gateway.sending = setOf("cmid-1")
        vm.storyComposerClosed()
        assertThat(vm.state.value.storyAwaitsPublication).isTrue()

        gateway.sending = emptySet()
        vm.refreshVerification()

        assertThat(vm.state.value.storyAwaitsPublication).isFalse()
        assertThat(vm.state.value.storyState).isEqualTo(OnboardingStoryState.IDLE)
    }

    @Test
    fun `the card keeps watching the server for a publication it awaits, whichever card is shown`() {
        val awaiting = OnboardingUiState(
            isPresented = true,
            card = OnboardingCard.Step(OnboardingStepId.NOTIFICATIONS),
            storyAwaitsPublication = true,
        )

        assertThat(awaiting.watchesServer).isTrue()
        assertThat(awaiting.copy(storyAwaitsPublication = false).watchesServer).isFalse()
        assertThat(awaiting.copy(isPresented = false).watchesServer).isFalse()
    }
}
