package me.meeshy.sdk.model.onboarding

import com.google.common.truth.Truth.assertThat
import java.time.LocalDate
import java.util.Locale
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.ConversationWriteRestriction
import me.meeshy.sdk.model.contacts.DirectoryContact
import me.meeshy.sdk.model.contacts.MatchedContactUser
import me.meeshy.sdk.model.media.MediaPermissionState
import org.junit.Test

private fun state(
    seen: List<OnboardingStepId> = emptyList(),
    prefilled: List<OnboardingStepId> = emptyList(),
    global: String? = "g1",
    suggestions: List<OnboardingSuggestion> = emptyList(),
    emailVerified: Boolean? = null,
    servesAge: Boolean = false,
    restriction: ConversationWriteRestriction? = null,
) = ApiOnboardingState(
    eligible = true,
    seenSteps = seen,
    prefilledSteps = prefilled,
    globalConversationId = global,
    suggestions = suggestions,
    emailVerified = emailVerified,
    servesAgeStep = servesAge,
    viewerWriteRestriction = restriction,
)

private fun suggestion(id: String, name: String = id) = OnboardingSuggestion(id, id, name)

class OnboardingFlowRulesTest {

    @Test
    fun `a bare account sees languages, story and global in iOS order`() {
        val steps = OnboardingFlowRules.pendingGestureSteps(state())

        assertThat(steps).containsExactly(
            OnboardingStepId.LANGUAGES, OnboardingStepId.GLOBAL, OnboardingStepId.STORY,
        ).inOrder()
    }

    @Test
    fun `age is served only by a gateway that knows it and comes before email and global`() {
        val steps = OnboardingFlowRules.pendingGestureSteps(state(servesAge = true, emailVerified = false))

        assertThat(steps).containsExactly(
            OnboardingStepId.LANGUAGES, OnboardingStepId.AGE, OnboardingStepId.EMAIL,
            OnboardingStepId.GLOBAL, OnboardingStepId.STORY,
        ).inOrder()
    }

    @Test
    fun `email card needs a declared unverified address, an unknown one invents nothing`() {
        assertThat(OnboardingFlowRules.pendingGestureSteps(state(emailVerified = true))).doesNotContain(OnboardingStepId.EMAIL)
        assertThat(OnboardingFlowRules.pendingGestureSteps(state(emailVerified = null))).doesNotContain(OnboardingStepId.EMAIL)
    }

    @Test
    fun `global card needs the conversation and an open composer`() {
        assertThat(OnboardingFlowRules.pendingGestureSteps(state(global = null))).doesNotContain(OnboardingStepId.GLOBAL)
        val minor = state(restriction = ConversationWriteRestriction.MinorGlobal)
        assertThat(OnboardingFlowRules.pendingGestureSteps(minor)).doesNotContain(OnboardingStepId.GLOBAL)
    }

    @Test
    fun `seen and prefilled steps are skipped`() {
        val steps = OnboardingFlowRules.pendingGestureSteps(
            state(seen = listOf(OnboardingStepId.LANGUAGES), prefilled = listOf(OnboardingStepId.STORY)),
        )

        assertThat(steps).containsExactly(OnboardingStepId.GLOBAL)
    }

    @Test
    fun `friends card needs suggestions or an offerable address book`() {
        assertThat(OnboardingFlowRules.pendingGestureSteps(state())).doesNotContain(OnboardingStepId.FRIENDS)
        assertThat(OnboardingFlowRules.pendingGestureSteps(state(), contactsOfferable = true)).contains(OnboardingStepId.FRIENDS)
        val withSuggestions = state(suggestions = listOf(suggestion("a")))
        assertThat(OnboardingFlowRules.pendingGestureSteps(withSuggestions)).contains(OnboardingStepId.FRIENDS)
    }

    @Test
    fun `a prefilled productive step counts as already produced`() {
        assertThat(OnboardingFlowRules.alreadyProduced(state(prefilled = listOf(OnboardingStepId.STORY)))).isTrue()
        assertThat(OnboardingFlowRules.alreadyProduced(state(prefilled = listOf(OnboardingStepId.LANGUAGES)))).isFalse()
    }
}

class OnboardingPlanTest {

    private fun plan(produced: Boolean, notifications: Boolean, vararg queue: OnboardingStepId) =
        OnboardingPlan(queue.toList(), notifications, produced)

    @Test
    fun `cards come out in queue order then the recap`() {
        var current = plan(false, false, OnboardingStepId.LANGUAGES, OnboardingStepId.STORY)
        val seen = mutableListOf<OnboardingCard>()
        repeat(3) {
            val (next, card) = current.next()
            current = next
            seen += card
        }

        assertThat(seen).containsExactly(
            OnboardingCard.Step(OnboardingStepId.LANGUAGES),
            OnboardingCard.Step(OnboardingStepId.STORY),
            OnboardingCard.Recap,
        ).inOrder()
    }

    @Test
    fun `notifications come after the gestures only when something was produced`() {
        val (_, card) = plan(true, true).next()

        assertThat(card).isEqualTo(OnboardingCard.Step(OnboardingStepId.NOTIFICATIONS))
    }

    @Test
    fun `without a produced gesture the notifications card leaves the plan`() {
        val (next, card) = plan(false, true, OnboardingStepId.LANGUAGES).next()
        assertThat(card).isEqualTo(OnboardingCard.Step(OnboardingStepId.LANGUAGES))

        val (last, recap) = next.next()

        assertThat(recap).isEqualTo(OnboardingCard.Recap)
        assertThat(last.plannedSteps).doesNotContain(OnboardingStepId.NOTIFICATIONS)
    }

    @Test
    fun `producing a gesture later brings the notifications card back in reach`() {
        val (next, _) = plan(false, true, OnboardingStepId.FRIENDS).next()

        val (_, card) = next.producing().next()

        assertThat(card).isEqualTo(OnboardingCard.Step(OnboardingStepId.NOTIFICATIONS))
    }

    @Test
    fun `removing a step shrinks both the queue and the progress count`() {
        val start = OnboardingPlan.start(state(servesAge = true), contactsOfferable = false, notificationsUndetermined = true)
        assertThat(start.plannedSteps).contains(OnboardingStepId.GLOBAL)

        val closed = start.without(OnboardingStepId.GLOBAL)

        assertThat(closed.queue).doesNotContain(OnboardingStepId.GLOBAL)
        assertThat(closed.plannedSteps).doesNotContain(OnboardingStepId.GLOBAL)
    }

    @Test
    fun `position counts from one and the recap closes the count`() {
        val start = OnboardingPlan.start(state(), contactsOfferable = false, notificationsUndetermined = true)

        assertThat(start.plannedSteps).containsExactly(
            OnboardingStepId.LANGUAGES, OnboardingStepId.GLOBAL, OnboardingStepId.STORY, OnboardingStepId.NOTIFICATIONS,
        ).inOrder()
        assertThat(start.position(OnboardingCard.Step(OnboardingStepId.LANGUAGES))).isEqualTo(1)
        assertThat(start.position(OnboardingCard.Step(OnboardingStepId.STORY))).isEqualTo(3)
        assertThat(start.position(OnboardingCard.Recap)).isEqualTo(4)
    }

    @Test
    fun `notifications are not planned once seen or once the system already answered`() {
        val seen = state(seen = listOf(OnboardingStepId.NOTIFICATIONS))
        assertThat(OnboardingPlan.start(seen, false, true).notificationsPending).isFalse()
        assertThat(OnboardingPlan.start(state(), false, false).notificationsPending).isFalse()
    }
}

class OnboardingStateParserTest {

    private fun parse(json: String) = OnboardingStateParser.parse(Json.parseToJsonElement(json))

    @Test
    fun `unknown steps are dropped not fatal`() {
        val parsed = parse("""{"eligible":true,"seenSteps":["languages","teleport"],"prefilledSteps":["story"]}""")!!

        assertThat(parsed.seenSteps).containsExactly(OnboardingStepId.LANGUAGES)
        assertThat(parsed.prefilledSteps).containsExactly(OnboardingStepId.STORY)
    }

    @Test
    fun `an absent protected regime is protected and forces the friends audience`() {
        val parsed = parse("""{"eligible":true,"storyDefaultVisibility":"public"}""")!!

        assertThat(parsed.protectedRegime).isTrue()
        assertThat(parsed.storyDefaultVisibility).isEqualTo(OnboardingStoryVisibility.FRIENDS)
    }

    @Test
    fun `an open regime keeps the served public audience`() {
        val parsed = parse("""{"eligible":true,"protectedRegime":false,"storyDefaultVisibility":"public"}""")!!

        assertThat(parsed.storyDefaultVisibility).isEqualTo(OnboardingStoryVisibility.PUBLIC)
    }

    @Test
    fun `serving the write restriction key, even null, means the gateway knows the age step`() {
        assertThat(parse("""{"eligible":true,"viewerWriteRestriction":null}""")!!.servesAgeStep).isTrue()
        assertThat(parse("""{"eligible":true}""")!!.servesAgeStep).isFalse()
        val minor = parse("""{"eligible":true,"viewerWriteRestriction":"minor-global"}""")!!
        assertThat(minor.viewerWriteRestriction).isEqualTo(ConversationWriteRestriction.MinorGlobal)
    }

    @Test
    fun `suggestions are capped at six and incomplete rows are dropped`() {
        val rows = (1..9).joinToString(",") { """{"id":"u$it","username":"n$it","displayName":"N$it"}""" }
        val parsed = parse("""{"eligible":true,"suggestions":[{"id":"x"},$rows]}""")!!

        assertThat(parsed.suggestions).hasSize(6)
        assertThat(parsed.suggestions.first().id).isEqualTo("u1")
    }

    @Test
    fun `step rewards need all three amounts`() {
        assertThat(parse("""{"eligible":true,"stepRewards":{"global":14,"story":10,"friendship":7}}""")!!.stepRewards)
            .isEqualTo(OnboardingStepRewards(14, 10, 7))
        assertThat(parse("""{"eligible":true,"stepRewards":{"global":14}}""")!!.stepRewards).isNull()
    }

    @Test
    fun `an unreadable payload is null`() {
        assertThat(parse("[]")).isNull()
        assertThat(OnboardingStateParser.parse(null)).isNull()
    }

    @Test
    fun `update bodies carry the contract keys`() {
        val body = Json.encodeToString(OnboardingStepUpdate.serializer(), OnboardingStepUpdate.of(OnboardingStepId.AGE, OnboardingStepOutcome.SKIPPED))
        assertThat(body).isEqualTo("""{"step":"age","outcome":"skipped"}""")
        val finish = Json { encodeDefaults = true }.encodeToString(OnboardingFinishUpdate.serializer(), OnboardingFinishUpdate())
        assertThat(finish).isEqualTo("""{"finish":true}""")
    }
}

class OnboardingContactsRulesTest {

    private fun contact(id: String, name: String?, onMeeshy: Boolean = true) = DirectoryContact(
        id = "c$id",
        displayName = name,
        isOnMeeshy = onMeeshy,
        matchedUser = MatchedContactUser(id = id, username = "u$id"),
    )

    @Test
    fun `initial phase follows the system permission`() {
        assertThat(OnboardingContactsRules.initialPhase(MediaPermissionState.NOT_DETERMINED)).isEqualTo(OnboardingContactsPhase.Offer)
        assertThat(OnboardingContactsRules.initialPhase(MediaPermissionState.GRANTED)).isEqualTo(OnboardingContactsPhase.Offer)
        assertThat(OnboardingContactsRules.initialPhase(MediaPermissionState.DENIED)).isEqualTo(OnboardingContactsPhase.DeniedBySystem)
        assertThat(OnboardingContactsRules.initialPhase(MediaPermissionState.RESTRICTED)).isEqualTo(OnboardingContactsPhase.Unavailable)
    }

    @Test
    fun `a denied or restricted address book cannot justify the card`() {
        assertThat(OnboardingContactsRules.isOfferable(MediaPermissionState.NOT_DETERMINED)).isTrue()
        assertThat(OnboardingContactsRules.isOfferable(MediaPermissionState.DENIED)).isFalse()
        assertThat(OnboardingContactsRules.isOfferable(MediaPermissionState.RESTRICTED)).isFalse()
    }

    @Test
    fun `a granted book searches on arrival`() {
        assertThat(OnboardingContactsRules.searchesOnArrival(MediaPermissionState.GRANTED)).isTrue()
        assertThat(OnboardingContactsRules.searchesOnArrival(MediaPermissionState.NOT_DETERMINED)).isFalse()
    }

    @Test
    fun `friends are registered, never oneself, deduplicated and sorted by the book name`() {
        val friends = OnboardingContactsRules.friends(
            listOf(
                contact("2", "zoé"), contact("1", "Alice"), contact("1", "Alice bis"),
                contact("me", "Moi"), contact("9", "Hors", onMeeshy = false),
            ),
            selfId = "me",
        )

        assertThat(friends.map { it.displayName }).containsExactly("Alice", "zoé").inOrder()
    }

    @Test
    fun `rows put found friends before the suggestions that do not repeat them`() {
        val rows = OnboardingContactsRules.rows(
            found = listOf(suggestion("a"), suggestion("b")),
            suggestions = listOf(suggestion("b"), suggestion("c")),
        )

        assertThat(rows.map { it.id }).containsExactly("a", "b", "c").inOrder()
    }
}

class OnboardingFriendsFitTest {
    private val all = (1..5).map { suggestion("u$it") }

    @Test
    fun `three profiles show until the user asks for more`() {
        assertThat(OnboardingFriendsFit.visible(all, expanded = false)).hasSize(3)
        assertThat(OnboardingFriendsFit.hiddenCount(all, expanded = false)).isEqualTo(2)
        assertThat(OnboardingFriendsFit.visible(all, expanded = true)).hasSize(5)
        assertThat(OnboardingFriendsFit.hiddenCount(all, expanded = true)).isEqualTo(0)
    }

    @Test
    fun `later is the only exit until a request left`() {
        assertThat(OnboardingFriendsFit.actions(false)).isEqualTo(OnboardingFriendsFit.FriendsActions.LATER_ONLY)
        assertThat(OnboardingFriendsFit.actions(true)).isEqualTo(OnboardingFriendsFit.FriendsActions.CONTINUE_ONLY)
    }
}

class OnboardingMiscRulesTest {
    @Test
    fun `rewards derive from the engagement catalogue`() {
        assertThat(OnboardingRewards.greeting).isEqualTo(14)
        assertThat(OnboardingRewards.story).isEqualTo(10)
        assertThat(OnboardingRewards.friendship).isEqualTo(7)
        assertThat(OnboardingRewards.firstLevel).isEqualTo(10)
        assertThat(OnboardingRewards.level(9)).isEqualTo(0)
        assertThat(OnboardingRewards.level(10)).isEqualTo(1)
        assertThat(OnboardingRewards.level(60)).isEqualTo(2)
    }

    @Test
    fun `the birth date picker starts at the minimum age and refuses future or ancient days`() {
        val today = LocalDate.of(2026, 10, 27)

        assertThat(OnboardingAgeRules.initialDate(today)).isEqualTo(LocalDate.of(2013, 10, 27))
        assertThat(OnboardingAgeRules.isSelectable(today, today)).isTrue()
        assertThat(OnboardingAgeRules.isSelectable(today.plusDays(1), today)).isFalse()
        assertThat(OnboardingAgeRules.isSelectable(today.minusYears(120), today)).isTrue()
        assertThat(OnboardingAgeRules.isSelectable(today.minusYears(120).minusDays(1), today)).isFalse()
    }

    @Test
    fun `greeting fills the personal gaps in the template locale`() {
        val text = OnboardingGreeting.compose("Moi c'est %1\$s, je parle %2\$s.", "Léa", "français et anglais", Locale.FRENCH)

        assertThat(text).isEqualTo("Moi c'est Léa, je parle français et anglais.")
        assertThat(OnboardingGreeting.contentLanguage("pt-BR")).isEqualTo("pt")
        assertThat(OnboardingGreeting.contentLanguage(null)).isEqualTo("fr")
    }
}
