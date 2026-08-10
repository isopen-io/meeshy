package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.AvailabilityResult
import me.meeshy.sdk.model.LoginRequest
import me.meeshy.sdk.model.MeEnvelope
import me.meeshy.sdk.model.RefreshTokenRequest
import me.meeshy.sdk.model.RegisterRequest
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

/** Corps de POST auth/forgot-password — le gateway repond toujours succes (anti-enumeration). */
@Serializable
data class ForgotPasswordRequest(
    val email: String,
)

/** Corps de POST auth/magic-link/request. */
@Serializable
data class MagicLinkRequestBody(
    val email: String,
    val rememberDevice: Boolean = false,
)

/** Reponse de la demande de magic link — la duree seed le compte a rebours UI. */
@Serializable
data class MagicLinkRequestData(
    val expiresInSeconds: Int? = null,
)

interface AuthApi {
    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): ApiResponse<AuthSession>

    @POST("auth/register")
    suspend fun register(@Body body: RegisterRequest): ApiResponse<AuthSession>

    @POST("auth/refresh")
    suspend fun refresh(@Body body: RefreshTokenRequest): ApiResponse<AuthSession>

    @GET("auth/me")
    suspend fun me(): ApiResponse<MeEnvelope>

    /**
     * Probe whether a username / email / phone is free before submitting the
     * registration wizard. Retrofit omits any `null` query parameter, so a
     * single-field probe hits `?username=…` alone. Parity with the gateway
     * `GET /auth/check-availability` endpoint.
     */
    @GET("auth/check-availability")
    suspend fun checkAvailability(
        @Query("username") username: String? = null,
        @Query("email") email: String? = null,
        @Query("phoneNumber") phoneNumber: String? = null,
    ): ApiResponse<AvailabilityResult>

    @POST("auth/forgot-password")
    suspend fun forgotPassword(@Body body: ForgotPasswordRequest): ApiResponse<Unit>

    @POST("auth/magic-link/request")
    suspend fun requestMagicLink(@Body body: MagicLinkRequestBody): ApiResponse<MagicLinkRequestData>
}
