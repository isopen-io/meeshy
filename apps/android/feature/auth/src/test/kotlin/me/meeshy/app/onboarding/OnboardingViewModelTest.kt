package me.meeshy.app.onboarding

import com.google.common.truth.Truth.assertThat
import java.time.LocalDate
import java.util.Locale
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.BirthDateDeclarationError
import me.meeshy.sdk.model.ConversationWriteRestriction
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.media.MediaPermissionState
import me.meeshy.sdk.model.onboarding.ApiOnboardingState
import me.meeshy.sdk.model.onboarding.OnboardingAgeState
import me.meeshy.sdk.model.onboarding.OnboardingCard
import me.meeshy.sdk.model.onboarding.OnboardingContactsPhase
import me.meeshy.sdk.model.onboarding.OnboardingSendState
import me.meeshy.sdk.model.onboarding.OnboardingStepId
import me.meeshy.sdk.model.onboarding.OnboardingStepOutcome
import me.meeshy.sdk.model.onboarding.OnboardingStepRewards
import me.meeshy.sdk.model.onboarding.OnboardingSuggestion
import org.junit.Test

private class FakeGateway : OnboardingGateway {
    var served: ApiOnboardingState? = ApiOnboardingState(eligible = true, globalConversationId = "g1")
    val settled = mutableSetOf<String>()
    val recorded = mutableListOf<Pair<OnboardingStepId, OnboardingStepOutcome>>()
    var finished = 0
    var languageUpdates = mutableListOf<Pair<String, String?>>()
    var languageUpdateSucceeds = true
    var resendSucceeds = true
    var birthResult: OnboardingBirthDateResult = OnboardingBirthDateResult.Declared(closesGlobal = false)
    var greetingSucceeds = true
    val greetings = mutableListOf<Triple<String, String, String?>>()
    var friendRequestSucceeds = true
    var contacts: List<OnboardingSuggestion>? = emptyList()
    var contactsState = MediaPermissionState.NOT_DETERMINED
    var notificationsUndetermined = true
    val progressReads = ArrayDeque<OnboardingProgress?>()
    var progressFallback: OnboardingProgress? = null

    override suspend fun fetchState() = served
    override suspend fun record(step: OnboardingStepId, outcome: OnboardingStepOutcome) {
        recorded += step to outcome
    }
    override suspend fun finish() { finished += 1 }
    override suspend fun updateLanguages(primary: String, secondary: String?): Boolean {
        languageUpdates += primary to secondary
        return languageUpdateSucceeds
    }
    override suspend fun resendVerification(email: String) = resendSucceeds
    override suspend fun declareBirthDate(pickerUtcMillis: Long) = birthResult
    override suspend fun sendGreeting(conversationId: String, text: String, declaredLanguage: String?): Boolean {
        greetings += Triple(conversationId, text, declaredLanguage)
        return greetingSucceeds
    }
    override suspend fun sendFriendRequest(userId: String) = friendRequestSucceeds
    override suspend fun findFriendsInContacts(selfId: String?) = contacts
    override suspend fun fetchProgress(): OnboardingProgress? =
        if (progressReads.isNotEmpty()) progressReads.removeFirst() else progressFallback
    override suspend fun contactsPermission() = contactsState
    override suspend fun notificationsUndetermined() = notificationsUndetermined
    override fun isSettled(userId: String) = userId in settled
    override fun markSettled(userId: String) { settled += userId }
}

private object FakeTexts : OnboardingTexts {
    override val locale: Locale = Locale.FRENCH
    override fun greetingTemplate(index: Int) = "Salut, moi c'est %1\$s, je parle %2\$s."
    override fun languageName(code: String) = code
    override fun join(names: List<String>) = names.joinToString("+")
}

private fun user(language: String? = "fr", regional: String? = null, email: String? = "ada@example.com") =
    MeeshyUser(id = "u1", username = "ada", displayName = "Ada", email = email, systemLanguage = language, regionalLanguage = regional)

private fun model(gateway: FakeGateway) = OnboardingViewModel(gateway, FakeTexts).apply {
    pause = { }
    pickTemplate = { 0 }
    today = { LocalDate.of(2026, 10, 27) }
}

private fun step(id: OnboardingStepId) = OnboardingCard.Step(id)

class OnboardingViewModelTest {

    // region Quand le parcours se lance, ce qui le saute

    @Test
    fun `a settled account is never asked again`() = runTest {
        val gateway = FakeGateway().apply { settled += "u1" }
        val vm = model(gateway)

        vm.start(user())

        assertThat(vm.state.value.isPresented).isFalse()
    }

    @Test
    fun `an ineligible or completed server state settles the account for good`() = runTest {
        val gateway = FakeGateway().apply { served = ApiOnboardingState(eligible = false) }
        val vm = model(gateway)

        vm.start(user())

        assertThat(gateway.settled).containsExactly("u1")
        assertThat(vm.state.value.isPresented).isFalse()
    }

    @Test
    fun `a network failure settles nothing so the read is retried`() = runTest {
        val gateway = FakeGateway().apply { served = null }
        val vm = model(gateway)

        vm.start(user())

        assertThat(gateway.settled).isEmpty()
        assertThat(vm.state.value.isPresented).isFalse()
    }

    @Test
    fun `an eligible account sees the first card, the greeting prefilled in its language`() = runTest {
        val vm = model(FakeGateway())

        vm.start(user(language = "fr", regional = "en"))

        assertThat(vm.state.value.isPresented).isTrue()
        assertThat(vm.state.value.card).isEqualTo(step(OnboardingStepId.LANGUAGES))
        assertThat(vm.state.value.greetingDraft).isEqualTo("Salut, moi c'est Ada, je parle fr+en.")
        assertThat(vm.state.value.stepPosition).isEqualTo(1)
    }

    @Test
    fun `the arrival celebration goes first, then the overlay opens on its first card`() = runTest {
        val vm = model(FakeGateway())
        vm.celebrationChanged(isShowing = true)

        vm.start(user())
        assertThat(vm.state.value.isPresented).isFalse()

        vm.celebrationChanged(isShowing = false)

        assertThat(vm.state.value.isPresented).isTrue()
        assertThat(vm.state.value.card).isEqualTo(step(OnboardingStepId.LANGUAGES))
    }

    @Test
    fun `a deep link elsewhere holds the overlay until the user is back at the root`() = runTest {
        val vm = model(FakeGateway())
        vm.routingChanged(isElsewhere = true)

        vm.start(user())
        assertThat(vm.state.value.isPresented).isFalse()

        vm.routingChanged(isElsewhere = false)
        assertThat(vm.state.value.isPresented).isTrue()
    }

    // endregion

    // region Navigation

    @Test
    fun `later passes the card and records it as skipped, losing nothing`() = runTest {
        val gateway = FakeGateway()
        val vm = model(gateway)
        vm.start(user())

        vm.later()

        assertThat(vm.state.value.card).isEqualTo(step(OnboardingStepId.GLOBAL))
        assertThat(gateway.recorded).containsExactly(OnboardingStepId.LANGUAGES to OnboardingStepOutcome.SKIPPED)
    }

    @Test
    fun `skip all closes, settles the account and finishes on the server`() = runTest {
        val gateway = FakeGateway()
        val vm = model(gateway)
        vm.start(user())

        vm.skipAll()

        assertThat(vm.state.value.isPresented).isFalse()
        assertThat(vm.state.value.card).isNull()
        assertThat(gateway.settled).containsExactly("u1")
        assertThat(gateway.finished).isEqualTo(1)
    }

    @Test
    fun `without a gesture the notifications card never shows and the recap closes the flow`() = runTest {
        val gateway = FakeGateway().apply {
            contactsState = MediaPermissionState.DENIED
            served = ApiOnboardingState(eligible = true, seenSteps = listOf(OnboardingStepId.LANGUAGES, OnboardingStepId.STORY))
        }
        val vm = model(gateway)
        vm.start(user())
        assertThat(vm.state.value.card).isEqualTo(OnboardingCard.Recap)
        assertThat(vm.state.value.plan.plannedSteps).doesNotContain(OnboardingStepId.NOTIFICATIONS)
    }

    // endregion

    // region Langues

    @Test
    fun `an unchanged language is not rewritten, a changed one is`() = runTest {
        val gateway = FakeGateway()
        val vm = model(gateway)
        vm.start(user(language = "fr"))
        vm.confirmLanguages()
        assertThat(gateway.languageUpdates).isEmpty()
        assertThat(gateway.recorded).containsExactly(OnboardingStepId.LANGUAGES to OnboardingStepOutcome.DONE)

        val second = FakeGateway()
        val other = model(second)
        other.start(user(language = "fr"))
        other.selectPrimaryLanguage("es")
        other.toggleSecondaryLanguage("en")
        other.confirmLanguages()
        assertThat(second.languageUpdates).containsExactly("es" to "en")
    }

    @Test
    fun `a profile without a saved language sends the prefilled one`() = runTest {
        val gateway = FakeGateway()
        val vm = model(gateway)
        vm.start(user(language = null))

        vm.confirmLanguages()

        assertThat(gateway.languageUpdates).hasSize(1)
    }

    @Test
    fun `the greeting follows the chosen languages until someone rewrites it`() = runTest {
        val vm = model(FakeGateway())
        vm.start(user(language = "fr"))

        vm.toggleSecondaryLanguage("en")
        assertThat(vm.state.value.greetingDraft).isEqualTo("Salut, moi c'est Ada, je parle fr+en.")

        vm.editGreeting("Mon texte")
        vm.toggleSecondaryLanguage("es")
        assertThat(vm.state.value.greetingDraft).isEqualTo("Mon texte")
    }

    @Test
    fun `choosing the primary language removes it from the secondary`() = runTest {
        val vm = model(FakeGateway())
        vm.start(user(language = "fr", regional = "en"))

        vm.selectPrimaryLanguage("en")

        assertThat(vm.state.value.secondaryLanguage).isNull()
        assertThat(vm.state.value.primaryLanguage).isEqualTo("en")
    }

    // endregion

    // region Âge

    private fun ageFlow(gateway: FakeGateway): OnboardingViewModel {
        gateway.served = ApiOnboardingState(eligible = true, globalConversationId = "g1", servesAgeStep = true)
        return model(gateway)
    }

    @Test
    fun `confirm needs a date the user actually chose`() = runTest {
        val gateway = FakeGateway()
        val vm = ageFlow(gateway)
        vm.start(user())
        vm.later()
        assertThat(vm.state.value.card).isEqualTo(step(OnboardingStepId.AGE))

        vm.declareBirthDate()
        assertThat(vm.state.value.card).isEqualTo(step(OnboardingStepId.AGE))

        vm.pickBirthDate(LocalDate.of(1990, 5, 1))
        vm.declareBirthDate()
        assertThat(vm.state.value.card).isEqualTo(step(OnboardingStepId.GLOBAL))
        assertThat(gateway.recorded.last()).isEqualTo(OnboardingStepId.AGE to OnboardingStepOutcome.DONE)
    }

    @Test
    fun `a minor loses the greeting card in Global`() = runTest {
        val gateway = FakeGateway().apply { birthResult = OnboardingBirthDateResult.Declared(closesGlobal = true) }
        val vm = ageFlow(gateway)
        vm.start(user())
        vm.later()
        vm.pickBirthDate(LocalDate.of(2010, 1, 1))

        vm.declareBirthDate()

        assertThat(vm.state.value.card).isEqualTo(step(OnboardingStepId.STORY))
        assertThat(vm.state.value.plan.plannedSteps).doesNotContain(OnboardingStepId.GLOBAL)
    }

    @Test
    fun `under thirteen refuses the session and the only exit signs out without settling`() = runTest {
        val gateway = FakeGateway().apply { birthResult = OnboardingBirthDateResult.Refused(BirthDateDeclarationError.BELOW_MINIMUM_AGE) }
        val vm = ageFlow(gateway)
        vm.start(user())
        vm.later()
        vm.pickBirthDate(LocalDate.of(2020, 1, 1))
        vm.declareBirthDate()
        assertThat(vm.state.value.ageState).isEqualTo(OnboardingAgeState.REFUSED)

        vm.acknowledgeAgeRefusal()

        assertThat(vm.state.value.signOutRequested).isTrue()
        assertThat(gateway.settled).isEmpty()
        assertThat(vm.state.value.isPresented).isFalse()
    }

    @Test
    fun `an invalid date or a network failure keeps the card and offers another try`() = runTest {
        val gateway = FakeGateway().apply { birthResult = OnboardingBirthDateResult.Refused(BirthDateDeclarationError.INVALID_DATE) }
        val vm = ageFlow(gateway)
        vm.start(user())
        vm.later()
        vm.pickBirthDate(LocalDate.of(1990, 1, 1))
        vm.declareBirthDate()
        assertThat(vm.state.value.ageState).isEqualTo(OnboardingAgeState.INVALID)

        vm.pickBirthDate(LocalDate.of(1991, 1, 1))

        assertThat(vm.state.value.ageState).isEqualTo(OnboardingAgeState.IDLE)
        assertThat(vm.state.value.card).isEqualTo(step(OnboardingStepId.AGE))
    }

    @Test
    fun `a date already known elsewhere counts as done and Global stays closed for a minor`() = runTest {
        val gateway = FakeGateway().apply { birthResult = OnboardingBirthDateResult.Refused(BirthDateDeclarationError.ALREADY_SET) }
        val vm = ageFlow(gateway)
        vm.start(user())
        vm.later()
        gateway.served = ApiOnboardingState(
            eligible = true, globalConversationId = "g1", servesAgeStep = true,
            viewerWriteRestriction = ConversationWriteRestriction.MinorGlobal,
        )
        vm.pickBirthDate(LocalDate.of(2010, 1, 1))

        vm.declareBirthDate()

        assertThat(vm.state.value.plan.plannedSteps).doesNotContain(OnboardingStepId.GLOBAL)
        assertThat(gateway.recorded.last()).isEqualTo(OnboardingStepId.AGE to OnboardingStepOutcome.DONE)
    }

    // endregion

    // region Adresse

    @Test
    fun `the resend link reports its outcome`() = runTest {
        val gateway = FakeGateway().apply { served = ApiOnboardingState(eligible = true, emailVerified = false) }
        val vm = model(gateway)
        vm.start(user())

        vm.resendVerificationLink()
        assertThat(vm.state.value.verificationLinkState).isEqualTo(OnboardingSendState.SENT)

        gateway.resendSucceeds = false
        vm.resendVerificationLink()
        assertThat(vm.state.value.verificationLinkState).isEqualTo(OnboardingSendState.FAILED)
    }

    @Test
    fun `a link touched in the mailbox advances the waiting email card on its own`() = runTest {
        val gateway = FakeGateway().apply { served = ApiOnboardingState(eligible = true, emailVerified = false) }
        val vm = model(gateway)
        vm.start(user())
        vm.later()
        assertThat(vm.state.value.card).isEqualTo(step(OnboardingStepId.EMAIL))

        gateway.served = ApiOnboardingState(eligible = true, emailVerified = true)
        vm.refreshVerification()

        assertThat(vm.state.value.card).isNotEqualTo(step(OnboardingStepId.EMAIL))
        assertThat(gateway.recorded.last()).isEqualTo(OnboardingStepId.EMAIL to OnboardingStepOutcome.DONE)
    }

    // endregion

    // region Salut

    private fun greetingFlow(gateway: FakeGateway): OnboardingViewModel {
        gateway.served = ApiOnboardingState(eligible = true, globalConversationId = "g1", seenSteps = listOf(OnboardingStepId.LANGUAGES), stepRewards = OnboardingStepRewards(14, 10, 7))
        return model(gateway)
    }

    @Test
    fun `an untouched greeting declares its language, a rewritten one lets the pipeline detect it`() = runTest {
        val gateway = FakeGateway()
        val vm = greetingFlow(gateway)
        vm.start(user())
        vm.sendGreeting()
        assertThat(gateway.greetings.single().third).isEqualTo("fr")

        val other = FakeGateway()
        val rewritten = greetingFlow(other)
        rewritten.start(user())
        rewritten.editGreeting("Hola a todos")
        rewritten.sendGreeting()
        assertThat(other.greetings.single()).isEqualTo(Triple("g1", "Hola a todos", null))
    }

    @Test
    fun `the gain shown is what the server credited, read as a difference`() = runTest {
        val gateway = FakeGateway().apply {
            progressReads += OnboardingProgress(score = 0, streakDays = 0, badges = 0, elanFactor = 1)
            progressReads += OnboardingProgress(score = 0, streakDays = 0, badges = 0, elanFactor = 1)
            progressReads += OnboardingProgress(score = 21, streakDays = 0, badges = 0, elanFactor = 1)
        }
        val vm = greetingFlow(gateway)
        vm.start(user())

        vm.sendGreeting()

        assertThat(vm.state.value.greetingReward).isEqualTo(21)
        assertThat(vm.state.value.sessionPoints).isEqualTo(21)
        assertThat(vm.state.value.gain!!.points).isEqualTo(21)
        assertThat(vm.state.value.greetingState).isEqualTo(OnboardingSendState.SENT)
        assertThat(gateway.recorded.last()).isEqualTo(OnboardingStepId.GLOBAL to OnboardingStepOutcome.DONE)
    }

    @Test
    fun `while the credit is not visible the announcement falls back on the served amount`() = runTest {
        val gateway = FakeGateway().apply { progressFallback = OnboardingProgress(0, 0, 0, 1) }
        val vm = greetingFlow(gateway)
        vm.start(user())

        vm.sendGreeting()

        assertThat(vm.state.value.greetingReward).isEqualTo(14)
    }

    @Test
    fun `a failed greeting stays retryable and credits nothing`() = runTest {
        val gateway = FakeGateway().apply { greetingSucceeds = false }
        val vm = greetingFlow(gateway)
        vm.start(user())

        vm.sendGreeting()

        assertThat(vm.state.value.greetingState).isEqualTo(OnboardingSendState.FAILED)
        assertThat(vm.state.value.sessionPoints).isEqualTo(0)
        assertThat(gateway.recorded).isEmpty()
    }

    @Test
    fun `a blank greeting is never sent`() = runTest {
        val gateway = FakeGateway()
        val vm = greetingFlow(gateway)
        vm.start(user())
        vm.editGreeting("   ")

        vm.sendGreeting()

        assertThat(gateway.greetings).isEmpty()
    }

    // endregion

    // region Story

    @Test
    fun `a story is credited only once the engagement sees it published`() = runTest {
        val gateway = FakeGateway().apply { served = ApiOnboardingState(eligible = true, seenSteps = listOf(OnboardingStepId.LANGUAGES), stepRewards = OnboardingStepRewards(14, 10, 7)) }
        val vm = model(gateway)
        vm.start(user())

        vm.storyComposerClosed()
        assertThat(vm.state.value.storyState).isEqualTo(OnboardingStoryState.IDLE)
        assertThat(vm.state.value.sessionPoints).isEqualTo(0)

        gateway.served = ApiOnboardingState(eligible = true, prefilledSteps = listOf(OnboardingStepId.STORY), stepRewards = OnboardingStepRewards(14, 10, 7))
        vm.storyComposerClosed()

        assertThat(vm.state.value.storyState).isEqualTo(OnboardingStoryState.PUBLISHED)
        assertThat(vm.state.value.storyReward).isEqualTo(10)
        assertThat(gateway.recorded.last()).isEqualTo(OnboardingStepId.STORY to OnboardingStepOutcome.DONE)
    }

    @Test
    fun `an unverified address that can no longer publish turns the story card into an invitation`() = runTest {
        val gateway = FakeGateway().apply { served = ApiOnboardingState(eligible = true, canPublishStory = false) }
        val vm = model(gateway)

        vm.start(user())

        assertThat(vm.state.value.storyNeedsEmailVerification).isTrue()
    }

    // endregion

    // region Amis et contacts

    private fun friendsFlow(gateway: FakeGateway, suggestions: List<OnboardingSuggestion> = emptyList()): OnboardingViewModel {
        gateway.served = ApiOnboardingState(
            eligible = true,
            seenSteps = listOf(OnboardingStepId.LANGUAGES, OnboardingStepId.GLOBAL, OnboardingStepId.STORY),
            suggestions = suggestions,
        )
        return model(gateway)
    }

    private fun suggestion(id: String) = OnboardingSuggestion(id, id, id.uppercase())

    @Test
    fun `an address book that cannot be offered and no suggestion means no friends card`() = runTest {
        val gateway = FakeGateway().apply { contactsState = MediaPermissionState.DENIED }
        val vm = friendsFlow(gateway)

        vm.start(user())

        assertThat(vm.state.value.card).isEqualTo(OnboardingCard.Recap)
    }

    @Test
    fun `adding a friend is optimistic and rolls back on failure`() = runTest {
        val gateway = FakeGateway()
        val vm = friendsFlow(gateway, listOf(suggestion("a")))
        vm.start(user())

        vm.addFriend("a")
        assertThat(vm.state.value.requestedProfileIds).containsExactly("a")

        gateway.friendRequestSucceeds = false
        vm.addFriend("b")
        assertThat(vm.state.value.requestedProfileIds).containsExactly("a")
        assertThat(vm.state.value.failedProfileId).isEqualTo("b")
    }

    @Test
    fun `a request sent calls the notifications card, none leaves the recap alone`() = runTest {
        val gateway = FakeGateway()
        val vm = friendsFlow(gateway, listOf(suggestion("a")))
        vm.start(user())
        vm.addFriend("a")

        vm.continueFromFriends()

        assertThat(vm.state.value.card).isEqualTo(step(OnboardingStepId.NOTIFICATIONS))
        assertThat(gateway.recorded.last()).isEqualTo(OnboardingStepId.FRIENDS to OnboardingStepOutcome.DONE)

        val quiet = FakeGateway().apply { contactsState = MediaPermissionState.DENIED }
        val other = friendsFlow(quiet, listOf(suggestion("a")))
        other.start(user())
        other.continueFromFriends()
        assertThat(other.state.value.card).isEqualTo(OnboardingCard.Recap)
        assertThat(quiet.recorded.last()).isEqualTo(OnboardingStepId.FRIENDS to OnboardingStepOutcome.SKIPPED)
    }

    @Test
    fun `finding friends asks the system only through the screen and lists the found ones first`() = runTest {
        val gateway = FakeGateway().apply { contacts = listOf(suggestion("z")) }
        val vm = friendsFlow(gateway, listOf(suggestion("a")))
        vm.start(user())
        var asked = 0

        vm.findFriendsInContacts { asked += 1; true }

        assertThat(asked).isEqualTo(1)
        assertThat(vm.state.value.contactsPhase).isInstanceOf(OnboardingContactsPhase.Found::class.java)
        assertThat(vm.state.value.friendRows.map { it.id }).containsExactly("z", "a").inOrder()
    }

    @Test
    fun `a refused system dialog falls back on the suggestions, or moves on without any`() = runTest {
        val vm = friendsFlow(FakeGateway(), listOf(suggestion("a")))
        vm.start(user())
        vm.findFriendsInContacts { false }
        assertThat(vm.state.value.contactsPhase).isEqualTo(OnboardingContactsPhase.Declined)
        assertThat(vm.state.value.card).isEqualTo(step(OnboardingStepId.FRIENDS))

        val gateway = FakeGateway()
        val bare = friendsFlow(gateway)
        bare.start(user())
        bare.findFriendsInContacts { false }
        assertThat(bare.state.value.card).isEqualTo(OnboardingCard.Recap)
    }

    @Test
    fun `a failed sync can be retried`() = runTest {
        val gateway = FakeGateway().apply { contacts = null }
        val vm = friendsFlow(gateway, listOf(suggestion("a")))
        vm.start(user())
        vm.findFriendsInContacts { true }
        assertThat(vm.state.value.contactsPhase).isEqualTo(OnboardingContactsPhase.Failed)

        gateway.contacts = emptyList()
        vm.findFriendsInContacts { true }

        assertThat(vm.state.value.contactsPhase).isEqualTo(OnboardingContactsPhase.Found(emptyList()))
    }

    @Test
    fun `an address book already granted searches on arrival without asking`() = runTest {
        val gateway = FakeGateway().apply { contactsState = MediaPermissionState.GRANTED; contacts = listOf(suggestion("z")) }
        val vm = friendsFlow(gateway)
        vm.start(user())

        vm.friendsCardAppeared()

        assertThat(vm.state.value.contactsPhase).isInstanceOf(OnboardingContactsPhase.Found::class.java)
    }

    @Test
    fun `coming back from settings with the access granted restarts the search`() = runTest {
        val gateway = FakeGateway().apply { contactsState = MediaPermissionState.DENIED; contacts = listOf(suggestion("z")) }
        val vm = friendsFlow(gateway, listOf(suggestion("a")))
        vm.start(user())
        assertThat(vm.state.value.contactsPhase).isEqualTo(OnboardingContactsPhase.DeniedBySystem)

        gateway.contactsState = MediaPermissionState.GRANTED
        vm.refreshContactsAccess()

        assertThat(vm.state.value.contactsPhase).isInstanceOf(OnboardingContactsPhase.Found::class.java)
    }

    // endregion

    // region Notifications

    @Test
    fun `the notifications card is planned only while the system dialog is still unused`() = runTest {
        val gateway = FakeGateway().apply { notificationsUndetermined = false }
        val vm = model(gateway)

        vm.start(user())

        assertThat(vm.state.value.plan.plannedSteps).doesNotContain(OnboardingStepId.NOTIFICATIONS)
    }

    @Test
    fun `yes asks through the screen then moves on, no never opens the dialog`() = runTest {
        val gateway = FakeGateway().apply { served = ApiOnboardingState(eligible = true, prefilledSteps = listOf(OnboardingStepId.STORY), seenSteps = listOf(OnboardingStepId.LANGUAGES, OnboardingStepId.GLOBAL)) }
        val vm = model(gateway)
        vm.start(user())
        vm.continueUntil(OnboardingStepId.NOTIFICATIONS)
        var asked = 0

        vm.acceptNotifications { asked += 1; true }

        assertThat(asked).isEqualTo(1)
        assertThat(vm.state.value.card).isEqualTo(OnboardingCard.Recap)
        assertThat(gateway.recorded.last()).isEqualTo(OnboardingStepId.NOTIFICATIONS to OnboardingStepOutcome.DONE)

        val other = FakeGateway().apply { served = gateway.served }
        val declining = model(other)
        declining.start(user())
        declining.continueUntil(OnboardingStepId.NOTIFICATIONS)
        declining.later()
        assertThat(other.recorded.last()).isEqualTo(OnboardingStepId.NOTIFICATIONS to OnboardingStepOutcome.SKIPPED)
    }

    // endregion

    // region Récapitulatif

    @Test
    fun `the recap reads the server progress`() = runTest {
        val gateway = FakeGateway().apply {
            served = ApiOnboardingState(eligible = true, seenSteps = OnboardingStepId.entries.toList())
            progressFallback = OnboardingProgress(score = 60, streakDays = 2, badges = 1, elanFactor = 1)
        }
        val vm = model(gateway)

        vm.start(user())

        val recap = vm.state.value.recap!!
        assertThat(recap.points).isEqualTo(60)
        assertThat(recap.level).isEqualTo(2)
        assertThat(recap.streakDays).isEqualTo(2)
    }

    @Test
    fun `without server progress the recap shows only what the session earned, never an invented streak`() = runTest {
        val gateway = FakeGateway().apply { served = ApiOnboardingState(eligible = true, seenSteps = OnboardingStepId.entries.toList()) }
        val vm = model(gateway)

        vm.start(user())

        val recap = vm.state.value.recap!!
        assertThat(recap.points).isEqualTo(0)
        assertThat(recap.streakDays).isNull()
        assertThat(recap.badges).isNull()
    }

    // endregion

    private suspend fun OnboardingViewModel.continueUntil(target: OnboardingStepId) {
        var guard = 0
        while (state.value.card != OnboardingCard.Step(target) && guard++ < 10) advance()
    }
}
