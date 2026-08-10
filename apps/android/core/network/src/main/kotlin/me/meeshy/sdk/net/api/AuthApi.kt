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
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
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

/** Une session active du compte — sous-ensemble utile de GET auth/sessions. */
@Serializable
data class ActiveSessionInfo(
    val id: String,
    val deviceType: String? = null,
    val deviceVendor: String? = null,
    val deviceModel: String? = null,
    val osName: String? = null,
    val osVersion: String? = null,
    val browserName: String? = null,
    val isMobile: Boolean? = null,
    val ipAddress: String? = null,
    val country: String? = null,
    val city: String? = null,
    val createdAt: String? = null,
    val lastActivityAt: String? = null,
    val isCurrentSession: Boolean = false,
)

/** Enveloppe data de GET auth/sessions. */
@Serializable
data class SessionsListData(
    val sessions: List<ActiveSessionInfo> = emptyList(),
    val totalCount: Int = 0,
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

    @GET("auth/sessions")
    suspend fun listSessions(): ApiResponse<SessionsListData>

    @DELETE("auth/sessions/{id}")
    suspend fun revokeSession(@Path("id") sessionId: String): ApiResponse<Unit>

    @DELETE("auth/sessions")
    suspend fun revokeOtherSessions(): ApiResponse<Unit>
}
