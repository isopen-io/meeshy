package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ChangeEmailRequest
import me.meeshy.sdk.model.ChangeEmailResponse
import me.meeshy.sdk.model.ChangePasswordRequest
import me.meeshy.sdk.model.ChangePasswordResponse
import me.meeshy.sdk.model.ChangePhoneRequest
import me.meeshy.sdk.model.ChangePhoneResponse
import me.meeshy.sdk.model.DeleteAccountRequest
import me.meeshy.sdk.model.DeleteAccountResponse
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.TimelinePoint
import me.meeshy.sdk.model.UpdateProfileRequest
import me.meeshy.sdk.model.UpdateProfileResponse
import me.meeshy.sdk.model.UserStats
import me.meeshy.sdk.model.VerifyEmailChangeRequest
import me.meeshy.sdk.model.VerifyEmailChangeResponse
import me.meeshy.sdk.model.VerifyPhoneChangeRequest
import me.meeshy.sdk.model.VerifyPhoneChangeResponse
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/** A user search result — port of UserSearchResult (ServiceModels.swift). */
@Serializable
data class UserSearchResult(
    val id: String,
    val username: String = "",
    val displayName: String? = null,
    val avatar: String? = null,
    val isOnline: Boolean? = null,
)

/** Avatar update body — port of UserService.updateAvatar inline body. */
@Serializable
data class UpdateAvatarRequest(
    val avatar: String,
)

/** Banner update body — port of UserService.updateBanner inline body. */
@Serializable
data class UpdateBannerRequest(
    val banner: String,
)

interface UserApi {
    @GET("users/search")
    suspend fun search(
        @Query("q") query: String,
        @Query("limit") limit: Int? = null,
        @Query("offset") offset: Int? = null,
    ): ApiResponse<List<UserSearchResult>>

    @PATCH("users/me")
    suspend fun updateProfile(@Body body: UpdateProfileRequest): ApiResponse<UpdateProfileResponse>

    @PATCH("users/me/avatar")
    suspend fun updateAvatar(@Body body: UpdateAvatarRequest): ApiResponse<UpdateProfileResponse>

    @PATCH("users/me/banner")
    suspend fun updateBanner(@Body body: UpdateBannerRequest): ApiResponse<UpdateProfileResponse>

    @GET("users/{idOrUsername}")
    suspend fun getProfile(@Path("idOrUsername") idOrUsername: String): ApiResponse<MeeshyUser>

    @GET("u/{username}")
    suspend fun getPublicProfile(@Path("username") username: String): ApiResponse<MeeshyUser>

    @GET("users/email/{email}")
    suspend fun getProfileByEmail(@Path("email") email: String): ApiResponse<MeeshyUser>

    @GET("users/id/{id}")
    suspend fun getProfileById(@Path("id") id: String): ApiResponse<MeeshyUser>

    @GET("users/phone/{phone}")
    suspend fun getProfileByPhone(@Path("phone") phone: String): ApiResponse<MeeshyUser>

    @POST("users/me/change-email")
    suspend fun changeEmail(@Body body: ChangeEmailRequest): ApiResponse<ChangeEmailResponse>

    @POST("users/me/verify-email-change")
    suspend fun verifyEmailChange(
        @Body body: VerifyEmailChangeRequest,
    ): ApiResponse<VerifyEmailChangeResponse>

    @POST("users/me/resend-email-change-verification")
    suspend fun resendEmailChangeVerification(): ApiResponse<ChangeEmailResponse>

    @PATCH("users/me/password")
    suspend fun changePassword(@Body body: ChangePasswordRequest): ApiResponse<ChangePasswordResponse>

    // Retrofit needs @HTTP(hasBody = true) to attach a body to a DELETE — gateway route
    // `DELETE /api/v1/me/delete-account` (routes/me/delete-account.ts).
    @HTTP(method = "DELETE", path = "me/delete-account", hasBody = true)
    suspend fun deleteAccount(@Body body: DeleteAccountRequest): ApiResponse<DeleteAccountResponse>

    @POST("users/me/change-phone")
    suspend fun changePhone(@Body body: ChangePhoneRequest): ApiResponse<ChangePhoneResponse>

    @POST("users/me/verify-phone-change")
    suspend fun verifyPhoneChange(
        @Body body: VerifyPhoneChangeRequest,
    ): ApiResponse<VerifyPhoneChangeResponse>

    @GET("users/{userId}/stats")
    suspend fun getUserStats(@Path("userId") userId: String): ApiResponse<UserStats>

    @GET("users/me/stats/timeline")
    suspend fun getUserStatsTimeline(@Query("days") days: Int): ApiResponse<List<TimelinePoint>>
}
