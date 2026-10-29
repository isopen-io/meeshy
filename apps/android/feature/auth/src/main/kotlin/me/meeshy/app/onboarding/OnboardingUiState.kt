package me.meeshy.app.onboarding

import androidx.compose.runtime.Immutable
import java.time.LocalDate
import me.meeshy.sdk.model.onboarding.OnboardingAgeRules
import me.meeshy.sdk.model.onboarding.OnboardingAgeState
import me.meeshy.sdk.model.onboarding.OnboardingCard
import me.meeshy.sdk.model.onboarding.OnboardingContactsPhase
import me.meeshy.sdk.model.onboarding.OnboardingContactsRules
import me.meeshy.sdk.model.onboarding.OnboardingGain
import me.meeshy.sdk.model.onboarding.OnboardingPlan
import me.meeshy.sdk.model.onboarding.OnboardingRecap
import me.meeshy.sdk.model.onboarding.OnboardingSendState
import me.meeshy.sdk.model.onboarding.OnboardingStoryVisibility
import me.meeshy.sdk.model.onboarding.OnboardingSuggestion

/** Où en est la première story : publiée, ou pas encore (le suivi d'upload en vol est un suivi, #13268). */
enum class OnboardingStoryState { IDLE, PUBLISHED }

/** Tout ce que les cartes lisent du parcours. Immuable : chaque geste en produit un nouveau. */
@Immutable
data class OnboardingUiState(
    val isPresented: Boolean = false,
    val card: OnboardingCard? = null,
    val plan: OnboardingPlan = OnboardingPlan(emptyList(), notificationsPending = false, producedSomething = false),
    val sessionPoints: Int = 0,
    val gain: OnboardingGain? = null,
    val greetingDraft: String = "",
    val greetingState: OnboardingSendState = OnboardingSendState.IDLE,
    val greetingReward: Int? = null,
    val storyState: OnboardingStoryState = OnboardingStoryState.IDLE,
    val storyReward: Int? = null,
    val storyVisibility: OnboardingStoryVisibility = OnboardingStoryVisibility.FRIENDS,
    val storyNeedsEmailVerification: Boolean = false,
    /** Le composeur s'est refermé sur une publication que le serveur n'a pas encore vue : la carte relit l'état. */
    val storyAwaitsPublication: Boolean = false,
    val verificationLinkState: OnboardingSendState = OnboardingSendState.IDLE,
    val accountEmail: String? = null,
    val userDisplayName: String = "",
    val requestedProfileIds: Set<String> = emptySet(),
    val failedProfileId: String? = null,
    val primaryLanguage: String = "fr",
    val secondaryLanguage: String? = null,
    val suggestions: List<OnboardingSuggestion> = emptyList(),
    val contactsPhase: OnboardingContactsPhase = OnboardingContactsPhase.Unavailable,
    val recap: OnboardingRecap? = null,
    val ageBirthDate: LocalDate = OnboardingAgeRules.initialDate(LocalDate.now()),
    val ageDatePicked: Boolean = false,
    val ageState: OnboardingAgeState = OnboardingAgeState.IDLE,
    val globalConversationId: String? = null,
    /** Sous 13 ans la session se ferme : l'hôte, qui tient l'authentification, la ferme. */
    val signOutRequested: Boolean = false,
) {
    /** La position de la carte courante parmi les étapes prévues, à partir de 1. */
    val stepPosition: Int get() = plan.position(card)

    val stepCount: Int get() = plan.plannedSteps.size

    val friendRows: List<OnboardingSuggestion>
        get() = (contactsPhase as? OnboardingContactsPhase.Found)
            ?.let { OnboardingContactsRules.rows(it.friends, suggestions) }
            ?: suggestions
}
