package me.meeshy.sdk.onboarding

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.onboarding.ApiOnboardingState
import me.meeshy.sdk.model.onboarding.OnboardingFinishUpdate
import me.meeshy.sdk.model.onboarding.OnboardingStateParser
import me.meeshy.sdk.model.onboarding.OnboardingStepId
import me.meeshy.sdk.model.onboarding.OnboardingStepOutcome
import me.meeshy.sdk.model.onboarding.OnboardingStepUpdate
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.OnboardingApi
import me.meeshy.sdk.net.apiCall

/**
 * Le parcours d'accueil côté passerelle (iOS `OnboardingService`). Une panne rend `null` : la lecture sera retentée, rien
 * n'est réglé. Les écritures sont idempotentes ; l'état rendu par chaque `PATCH` n'est pas relu (le client le tient).
 */
@Singleton
class OnboardingRepository @Inject constructor(
    private val api: OnboardingApi,
) {
    suspend fun fetchState(): ApiOnboardingState? =
        (apiCall { api.state() } as? NetworkResult.Success)?.let { OnboardingStateParser.parse(it.data) }

    /** Vrai quand la passerelle a accusé l'écriture. */
    suspend fun record(step: OnboardingStepId, outcome: OnboardingStepOutcome): Boolean =
        apiCall { api.record(OnboardingStepUpdate.of(step, outcome)) } is NetworkResult.Success

    suspend fun finish(): Boolean = apiCall { api.finish(OnboardingFinishUpdate.closing) } is NetworkResult.Success
}
