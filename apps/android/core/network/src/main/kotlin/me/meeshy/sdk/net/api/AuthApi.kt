package me.meeshy.sdk.net.api

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
}
