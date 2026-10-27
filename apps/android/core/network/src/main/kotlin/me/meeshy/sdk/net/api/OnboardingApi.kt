package me.meeshy.sdk.net.api

import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.onboarding.OnboardingFinishUpdate
import me.meeshy.sdk.model.onboarding.OnboardingStepUpdate
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH

/**
 * Le parcours d'accueil (iOS `OnboardingService`) : la passerelle DÉCLARE le parcours, le client l'affiche. La charge est
 * rendue en [JsonElement] et lue par `OnboardingStateParser` (`:core:model`) : une étape ajoutée au serveur avant la mise
 * à jour de l'app est écartée, jamais fatale.
 */
interface OnboardingApi {
    @GET("me/onboarding")
    suspend fun state(): ApiResponse<JsonElement>

    /** Une carte vue, avec ce qu'on en a fait. Idempotent. */
    @PATCH("me/onboarding")
    suspend fun record(@Body body: OnboardingStepUpdate): ApiResponse<JsonElement>

    /** La fin du parcours. */
    @PATCH("me/onboarding")
    suspend fun finish(@Body body: OnboardingFinishUpdate): ApiResponse<JsonElement>
}
