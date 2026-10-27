package me.meeshy.sdk.model.onboarding

/** La carte à l'écran : une des étapes du contrat, ou le récapitulatif final (que le serveur ne compte pas). */
sealed interface OnboardingCard {
    data class Step(val id: OnboardingStepId) : OnboardingCard
    data object Recap : OnboardingCard
}

/** La règle pure qui décide quelles cartes restent à montrer (iOS `OnboardingFlow`). */
object OnboardingFlowRules {
    /**
     * Les étapes « geste », dans l'ordre. La carte notifications n'en fait pas partie : elle n'est proposée
     * qu'APRÈS, et seulement si un geste a produit de quoi être notifié. L'âge précède Global : un 13-17 ans y lit
     * sans écrire, la carte du salut n'a donc pas lieu d'être après sa déclaration.
     */
    val gestureSteps: List<OnboardingStepId> = listOf(
        OnboardingStepId.LANGUAGES,
        OnboardingStepId.AGE,
        OnboardingStepId.EMAIL,
        OnboardingStepId.GLOBAL,
        OnboardingStepId.STORY,
        OnboardingStepId.FRIENDS,
    )

    /** Les étapes qui PEUVENT appeler une réponse — celles qui justifient de proposer les notifications. */
    val productiveSteps: Set<OnboardingStepId> = setOf(
        OnboardingStepId.GLOBAL,
        OnboardingStepId.STORY,
        OnboardingStepId.FRIENDS,
    )

    /**
     * `contactsOfferable` : la proposition « retrouver tes amis » peut aboutir — elle suffit alors à faire naître la
     * carte des amis, même sans profil suggéré.
     */
    fun pendingGestureSteps(state: ApiOnboardingState, contactsOfferable: Boolean = false): List<OnboardingStepId> {
        val settled = state.seenSteps.toSet() + state.prefilledSteps.toSet()
        return gestureSteps.filter { step ->
            if (step in settled) return@filter false
            when (step) {
                OnboardingStepId.GLOBAL ->
                    state.globalConversationId != null && state.viewerWriteRestriction?.closesComposer != true
                OnboardingStepId.AGE -> state.servesAgeStep
                OnboardingStepId.FRIENDS -> state.suggestions.isNotEmpty() || contactsOfferable
                OnboardingStepId.EMAIL -> state.emailVerified == false
                OnboardingStepId.LANGUAGES, OnboardingStepId.STORY, OnboardingStepId.NOTIFICATIONS -> true
            }
        }
    }

    fun alreadyProduced(state: ApiOnboardingState): Boolean =
        state.prefilledSteps.any { it in productiveSteps }
}

/**
 * Le plan d'affichage, IMMUABLE : chaque transition rend un nouveau plan (iOS : `queue`, `notificationsPending`,
 * `producedSomething`, `plannedSteps` de `OnboardingViewModel`). Ce qui est décidé ICI : l'ordre des cartes et le
 * moment de la carte notifications.
 */
data class OnboardingPlan(
    val queue: List<OnboardingStepId>,
    val notificationsPending: Boolean,
    val producedSomething: Boolean,
    val plannedSteps: List<OnboardingStepId> = queue + if (notificationsPending) listOf(OnboardingStepId.NOTIFICATIONS) else emptyList(),
) {
    /** La carte suivante, et le plan une fois cette carte tirée. */
    fun next(): Pair<OnboardingPlan, OnboardingCard> {
        if (queue.isNotEmpty()) {
            return copy(queue = queue.drop(1)) to OnboardingCard.Step(queue.first())
        }
        if (notificationsPending && producedSomething) {
            return copy(notificationsPending = false) to OnboardingCard.Step(OnboardingStepId.NOTIFICATIONS)
        }
        if (notificationsPending) {
            return copy(
                notificationsPending = false,
                plannedSteps = plannedSteps - OnboardingStepId.NOTIFICATIONS,
            ) to OnboardingCard.Recap
        }
        return this to OnboardingCard.Recap
    }

    /** Un geste a produit de quoi être notifié : la carte notifications peut naître. */
    fun producing(): OnboardingPlan = if (producedSomething) this else copy(producedSomething = true)

    /** Retire une étape à venir (âge sous 18 ans : plus de salut ; adresse vérifiée ailleurs). */
    fun without(step: OnboardingStepId): OnboardingPlan =
        copy(queue = queue - step, plannedSteps = plannedSteps - step)

    /** La carte notifications a été montrée hors file (aperçu) : elle ne reviendra pas. */
    fun notificationsShown(): OnboardingPlan = copy(notificationsPending = false)

    /** La position de [card] parmi les étapes prévues, à partir de 1 ; le récapitulatif vaut le total. */
    fun position(card: OnboardingCard?): Int {
        val step = (card as? OnboardingCard.Step)?.id ?: return plannedSteps.size
        val index = plannedSteps.indexOf(step)
        return if (index < 0) plannedSteps.size else index + 1
    }

    companion object {
        /**
         * Le plan de départ. [notificationsUndetermined] : la fenêtre système n'a jamais servi — sinon la carte
         * notifications n'est pas prévue. Elle l'est aussi seulement si le serveur ne l'a pas déjà vue.
         */
        fun start(
            state: ApiOnboardingState,
            contactsOfferable: Boolean,
            notificationsUndetermined: Boolean,
        ): OnboardingPlan {
            val unseen = OnboardingStepId.NOTIFICATIONS !in state.seenSteps
            return OnboardingPlan(
                queue = OnboardingFlowRules.pendingGestureSteps(state, contactsOfferable),
                notificationsPending = unseen && notificationsUndetermined,
                producedSomething = OnboardingFlowRules.alreadyProduced(state),
            )
        }
    }
}

/** Les règles qui font TENIR la carte « amis » dans l'écran (iOS `OnboardingCardFit`). */
object OnboardingFriendsFit {
    const val SUGGESTIONS_SHOWN: Int = 3

    fun visible(all: List<OnboardingSuggestion>, expanded: Boolean): List<OnboardingSuggestion> =
        if (expanded) all else all.take(SUGGESTIONS_SHOWN)

    fun hiddenCount(all: List<OnboardingSuggestion>, expanded: Boolean): Int =
        all.size - visible(all, expanded).size

    /**
     * Tant qu'aucune demande n'est partie, la seule sortie réelle est « Plus tard », et c'est elle qui tient la
     * place principale — jamais un « Continuer » inerte au premier plan.
     */
    fun actions(hasRequests: Boolean): FriendsActions =
        if (hasRequests) FriendsActions.CONTINUE_ONLY else FriendsActions.LATER_ONLY

    enum class FriendsActions { LATER_ONLY, CONTINUE_ONLY }
}
