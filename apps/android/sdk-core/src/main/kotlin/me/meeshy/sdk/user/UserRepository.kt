package me.meeshy.sdk.user

import me.meeshy.sdk.model.ChangeEmailRequest
import me.meeshy.sdk.model.ChangeEmailResponse
import me.meeshy.sdk.model.ChangePhoneRequest
import me.meeshy.sdk.model.ChangePhoneResponse
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.TimelinePoint
import me.meeshy.sdk.model.UpdateProfileRequest
import me.meeshy.sdk.model.UserStats
import me.meeshy.sdk.model.VerifyEmailChangeRequest
import me.meeshy.sdk.model.VerifyEmailChangeResponse
import me.meeshy.sdk.model.VerifyPhoneChangeRequest
import me.meeshy.sdk.model.VerifyPhoneChangeResponse
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.UpdateAvatarRequest
import me.meeshy.sdk.net.api.UpdateBannerRequest
import me.meeshy.sdk.net.api.UserApi
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/** User search, profile lookup and contact changes — port of UserService (UserService.swift). */
@Singleton
class UserRepository @Inject constructor(
    private val userApi: UserApi,
) {
    suspend fun searchUsers(
        query: String,
        limit: Int = 20,
        offset: Int = 0,
    ): NetworkResult<List<UserSearchResult>> =
        apiCall { userApi.search(query, limit, offset) }

    suspend fun updateProfile(request: UpdateProfileRequest): NetworkResult<MeeshyUser> =
        apiCall { userApi.updateProfile(request) }.map { it.user }

    suspend fun updateAvatar(url: String): NetworkResult<MeeshyUser> =
        apiCall { userApi.updateAvatar(UpdateAvatarRequest(url)) }.map { it.user }

    suspend fun updateBanner(url: String): NetworkResult<MeeshyUser> =
        apiCall { userApi.updateBanner(UpdateBannerRequest(url)) }.map { it.user }

    suspend fun getProfile(idOrUsername: String): NetworkResult<MeeshyUser> =
        apiCall { userApi.getProfile(idOrUsername) }

    suspend fun getPublicProfile(username: String): NetworkResult<MeeshyUser> =
        apiCall { userApi.getPublicProfile(username) }

    suspend fun getProfileByEmail(email: String): NetworkResult<MeeshyUser> =
        apiCall { userApi.getProfileByEmail(email) }

    suspend fun getProfileById(id: String): NetworkResult<MeeshyUser> =
        apiCall { userApi.getProfileById(id) }

    suspend fun getProfileByPhone(phone: String): NetworkResult<MeeshyUser> =
        apiCall { userApi.getProfileByPhone(phone.replace("+", "")) }

    suspend fun changeEmail(newEmail: String): NetworkResult<ChangeEmailResponse> =
        apiCall { userApi.changeEmail(ChangeEmailRequest(newEmail)) }

    suspend fun verifyEmailChange(token: String): NetworkResult<VerifyEmailChangeResponse> =
        apiCall { userApi.verifyEmailChange(VerifyEmailChangeRequest(token)) }

    suspend fun resendEmailChangeVerification(): NetworkResult<ChangeEmailResponse> =
        apiCall { userApi.resendEmailChangeVerification() }

    suspend fun changePhone(newPhoneNumber: String): NetworkResult<ChangePhoneResponse> =
        apiCall { userApi.changePhone(ChangePhoneRequest(newPhoneNumber)) }

    suspend fun verifyPhoneChange(code: String): NetworkResult<VerifyPhoneChangeResponse> =
        apiCall { userApi.verifyPhoneChange(VerifyPhoneChangeRequest(code)) }

    suspend fun getUserStats(userId: String): NetworkResult<UserStats> =
        apiCall { userApi.getUserStats(userId) }

    /**
     * The signed-in user's daily message-activity timeline. This is a `me`-only
     * gateway endpoint (`/users/me/stats/timeline`) — it always reports the
     * caller's own activity, so it is never keyed by a viewed user id. [days] is
     * clamped to the gateway-accepted `7..90` window.
     */
    suspend fun getUserStatsTimeline(days: Int = 30): NetworkResult<List<TimelinePoint>> =
        apiCall { userApi.getUserStatsTimeline(days.coerceIn(7, 90)) }
}
