package me.meeshy.sdk.session

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.LoginRequest
import me.meeshy.sdk.model.MeEnvelope
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.RefreshTokenRequest
import me.meeshy.sdk.model.RegisterRequest
import me.meeshy.sdk.model.RegisterResponse
import me.meeshy.sdk.model.UpdateProfileRequest
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.api.AuthApi
import org.junit.Test

private class FakeAuthApi(var meResponse: ApiResponse<MeEnvelope>) : AuthApi {
    override suspend fun login(body: LoginRequest) = ApiResponse<AuthSession>(success = false)
    override suspend fun register(body: RegisterRequest) = ApiResponse<RegisterResponse>(success = false)
    override suspend fun refresh(body: RefreshTokenRequest) = ApiResponse<AuthSession>(success = false)
    override suspend fun me() = meResponse
    override suspend fun forgotPassword(body: me.meeshy.sdk.net.api.ForgotPasswordRequest) =
        me.meeshy.sdk.model.ApiResponse<Unit>(success = true)
    override suspend fun requestMagicLink(body: me.meeshy.sdk.net.api.MagicLinkRequestBody) =
        me.meeshy.sdk.model.ApiResponse<me.meeshy.sdk.net.api.MagicLinkRequestData>(success = false)
    override suspend fun listSessions() =
        me.meeshy.sdk.model.ApiResponse<me.meeshy.sdk.net.api.SessionsListData>(success = false)
    override suspend fun revokeSession(sessionId: String) =
        me.meeshy.sdk.model.ApiResponse<Unit>(success = true)
    override suspend fun revokeOtherSessions() =
        me.meeshy.sdk.model.ApiResponse<Unit>(success = true)
    override suspend fun validateMagicLink(body: me.meeshy.sdk.net.api.MagicLinkValidateRequest) =
        me.meeshy.sdk.model.ApiResponse<me.meeshy.sdk.model.AuthSession>(success = false)
    override suspend fun checkAvailability(username: String?, email: String?, phoneNumber: String?) =
        ApiResponse<me.meeshy.sdk.model.AvailabilityResult>(success = false)
    override suspend fun getTwoFactorStatus() =
        me.meeshy.sdk.model.ApiResponse<me.meeshy.sdk.net.api.TwoFactorStatusInfo>(success = false)
    override suspend fun beginTwoFactorSetup() =
        me.meeshy.sdk.model.ApiResponse<me.meeshy.sdk.net.api.TwoFactorSetupInfo>(success = false)
    override suspend fun enableTwoFactor(body: me.meeshy.sdk.net.api.TwoFactorCodeRequest) =
        me.meeshy.sdk.model.ApiResponse<me.meeshy.sdk.net.api.TwoFactorBackupCodesInfo>(success = false)
    override suspend fun disableTwoFactor(body: me.meeshy.sdk.net.api.TwoFactorDisableRequest) =
        me.meeshy.sdk.model.ApiResponse<Unit>(success = true)
    override suspend fun regenerateTwoFactorBackupCodes(body: me.meeshy.sdk.net.api.TwoFactorCodeRequest) =
        me.meeshy.sdk.model.ApiResponse<me.meeshy.sdk.net.api.TwoFactorBackupCodesInfo>(success = false)
}

class SessionRepositoryTest {

    private fun user(id: String = "u1", anonymous: Boolean = false) =
        MeeshyUser(id = id, username = "atabeth", isAnonymous = anonymous)

    @Test
    fun `adopt publishes the current user`() {
        val repo = SessionRepository(FakeAuthApi(ApiResponse(success = false)), InMemoryTokenStore())

        repo.adopt(user("u1"))

        assertThat(repo.currentUser.value?.id).isEqualTo("u1")
        assertThat(repo.currentUserId).isEqualTo("u1")
    }

    @Test
    fun `clear drops the current user`() {
        val repo = SessionRepository(FakeAuthApi(ApiResponse(success = false)), InMemoryTokenStore())
        repo.adopt(user("u1"))

        repo.clear()

        assertThat(repo.currentUser.value).isNull()
    }

    @Test
    fun `refresh without a token clears the session`() = runTest {
        val repo = SessionRepository(FakeAuthApi(ApiResponse(success = false)), InMemoryTokenStore())
        repo.adopt(user("stale"))

        repo.refresh()

        assertThat(repo.currentUser.value).isNull()
    }

    @Test
    fun `refresh with a token loads the user from the gateway`() = runTest {
        val api = FakeAuthApi(ApiResponse(success = true, data = MeEnvelope(user("u9"))))
        val repo = SessionRepository(api, InMemoryTokenStore(jwt = "jwt"))

        repo.refresh()

        assertThat(repo.currentUser.value?.id).isEqualTo("u9")
    }

    @Test
    fun `applyProfileEdit republishes the merged identity`() {
        val repo = SessionRepository(FakeAuthApi(ApiResponse(success = false)), InMemoryTokenStore())
        repo.adopt(user("u1").copy(displayName = "Old", bio = "old bio", systemLanguage = "fr"))

        repo.applyProfileEdit(UpdateProfileRequest(displayName = "New", systemLanguage = "de"))

        val published = repo.currentUser.value
        assertThat(published?.displayName).isEqualTo("New")
        assertThat(published?.systemLanguage).isEqualTo("de")
        // an absent field is left untouched
        assertThat(published?.bio).isEqualTo("old bio")
    }

    @Test
    fun `applyProfileEdit is inert when no session is active`() {
        val repo = SessionRepository(FakeAuthApi(ApiResponse(success = false)), InMemoryTokenStore())

        repo.applyProfileEdit(UpdateProfileRequest(displayName = "New"))

        assertThat(repo.currentUser.value).isNull()
    }

    @Test
    fun `refresh failure keeps the current user`() = runTest {
        val api = FakeAuthApi(ApiResponse(success = false, error = "offline"))
        val repo = SessionRepository(api, InMemoryTokenStore(jwt = "jwt"))
        repo.adopt(user("cached"))

        repo.refresh()

        assertThat(repo.currentUser.value?.id).isEqualTo("cached")
    }

    @Test
    fun `adopt persists the user id in the token store`() {
        val tokenStore = InMemoryTokenStore()
        val repo = SessionRepository(FakeAuthApi(ApiResponse(success = false)), tokenStore)

        repo.adopt(user("u1"))

        // The widget process reads TokenStore.userId directly (SessionRepository is
        // in-memory only and unpopulated in a cold widget-update process) — see
        // widget-recent-conversations. adopt() must keep it in lockstep with currentUser.
        assertThat(tokenStore.userId).isEqualTo("u1")
    }

    @Test
    fun `clear wipes the persisted user id`() {
        val tokenStore = InMemoryTokenStore()
        val repo = SessionRepository(FakeAuthApi(ApiResponse(success = false)), tokenStore)
        repo.adopt(user("u1"))

        repo.clear()

        assertThat(tokenStore.userId).isNull()
    }

    @Test
    fun `refresh with a token persists the fetched user id`() = runTest {
        val api = FakeAuthApi(ApiResponse(success = true, data = MeEnvelope(user("u9"))))
        val tokenStore = InMemoryTokenStore(jwt = "jwt")
        val repo = SessionRepository(api, tokenStore)

        repo.refresh()

        assertThat(tokenStore.userId).isEqualTo("u9")
    }

    @Test
    fun `refresh failure leaves the persisted user id untouched`() = runTest {
        val api = FakeAuthApi(ApiResponse(success = false, error = "offline"))
        val tokenStore = InMemoryTokenStore(jwt = "jwt", userId = "cached")
        val repo = SessionRepository(api, tokenStore)
        repo.adopt(user("cached"))

        repo.refresh()

        assertThat(tokenStore.userId).isEqualTo("cached")
    }
}
