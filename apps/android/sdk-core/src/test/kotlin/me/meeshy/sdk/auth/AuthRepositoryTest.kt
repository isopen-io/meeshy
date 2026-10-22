package me.meeshy.sdk.auth

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.AvailabilityResult
import me.meeshy.sdk.model.LoginRequest
import me.meeshy.sdk.model.MeEnvelope
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.RefreshTokenRequest
import me.meeshy.sdk.model.RegisterRequest
import me.meeshy.sdk.model.RegisterResponse
import me.meeshy.sdk.model.auth.EmailVerificationRequest
import me.meeshy.sdk.model.auth.EmailVerificationWatchStatus
import me.meeshy.sdk.model.auth.LoginOutcome
import me.meeshy.sdk.model.auth.LoginResponse
import me.meeshy.sdk.model.auth.MeSecurityEnvelope
import me.meeshy.sdk.model.auth.MeSecuritySummary
import me.meeshy.sdk.model.auth.MeSecurityUser
import me.meeshy.sdk.model.auth.ResetPasswordRequest
import me.meeshy.sdk.model.auth.ResetTokenVerification
import me.meeshy.sdk.model.auth.TwoFactorLoginRequest
import me.meeshy.sdk.model.auth.VerificationStatusData
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.api.MagicLinkValidateRequest
import okhttp3.ResponseBody.Companion.toResponseBody
import retrofit2.HttpException
import retrofit2.Response
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.TokenStore
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.session.SessionTeardown
import me.meeshy.sdk.sync.SyncSeqTracker
import org.junit.Test

class AuthRepositoryTest {

    private class RecordingSessionTeardown : SessionTeardown {
        var wipeCallCount = 0
            private set

        override suspend fun wipe() {
            wipeCallCount += 1
        }
    }

    private class FakeAuthApi(
        var response: ApiResponse<AuthSession>,
        var registerResponse: ApiResponse<RegisterResponse> = ApiResponse(success = false),
        var availabilityResponse: ApiResponse<AvailabilityResult> = ApiResponse(success = false),
        val availabilityCalls: MutableList<Triple<String?, String?, String?>> = mutableListOf(),
    ) : AuthApi {
        var loginResponse: ApiResponse<LoginResponse>? = null
        var twoFactorResponse: ApiResponse<LoginResponse> = ApiResponse(success = false)
        var verifyEmailResponse: ApiResponse<LoginResponse> = ApiResponse(success = false)
        var magicLinkResponse: ApiResponse<LoginResponse> = ApiResponse(success = false)
        var verificationStatusResponse: ApiResponse<VerificationStatusData> = ApiResponse(success = false)
        var verificationStatusFailure: Throwable? = null
        var resetTokenResponse: ApiResponse<ResetTokenVerification> = ApiResponse(success = false)
        var meSecurityResponse: ApiResponse<MeSecurityEnvelope> = ApiResponse(success = false)
        val loginRequests: MutableList<LoginRequest> = mutableListOf()
        val twoFactorRequests: MutableList<TwoFactorLoginRequest> = mutableListOf()
        val verifyEmailRequests: MutableList<EmailVerificationRequest> = mutableListOf()
        val magicLinkRequests: MutableList<MagicLinkValidateRequest> = mutableListOf()
        val resetRequests: MutableList<ResetPasswordRequest> = mutableListOf()

        override suspend fun login(body: LoginRequest): ApiResponse<LoginResponse> {
            loginRequests += body
            return loginResponse ?: ApiResponse(
                success = response.success,
                data = response.data?.let {
                    LoginResponse(user = it.user, token = it.token, sessionToken = it.sessionToken, expiresIn = it.expiresIn)
                },
                error = response.error,
                message = response.message,
                code = response.code,
            )
        }
        override suspend fun register(body: RegisterRequest) = registerResponse
        override suspend fun refresh(body: RefreshTokenRequest) = response
        override suspend fun me() = ApiResponse<MeEnvelope>(success = false)
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
        override suspend fun validateMagicLink(body: MagicLinkValidateRequest): ApiResponse<LoginResponse> {
            magicLinkRequests += body
            return magicLinkResponse
        }
        override suspend fun checkAvailability(username: String?, email: String?, phoneNumber: String?): ApiResponse<AvailabilityResult> {
            availabilityCalls += Triple(username, email, phoneNumber)
            return availabilityResponse
        }
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
        override suspend fun completeLoginWith2FA(body: TwoFactorLoginRequest): ApiResponse<LoginResponse> {
            twoFactorRequests += body
            return twoFactorResponse
        }
        override suspend fun verifyEmail(body: EmailVerificationRequest): ApiResponse<LoginResponse> {
            verifyEmailRequests += body
            return verifyEmailResponse
        }
        override suspend fun resendVerification(body: me.meeshy.sdk.model.auth.ResendVerificationRequest) =
            ApiResponse<Unit>(success = true)
        override suspend fun verificationStatus(
            body: me.meeshy.sdk.model.auth.VerificationStatusRequest,
        ): ApiResponse<VerificationStatusData> {
            verificationStatusFailure?.let { throw it }
            return verificationStatusResponse
        }
        override suspend fun verifyResetToken(body: me.meeshy.sdk.model.auth.ResetTokenVerificationRequest) =
            resetTokenResponse
        override suspend fun resetPassword(body: ResetPasswordRequest): ApiResponse<Unit> {
            resetRequests += body
            return ApiResponse(success = true)
        }
        override suspend fun phoneRecoveryLookup(body: me.meeshy.sdk.model.auth.PhoneRecoveryLookupRequest) =
            ApiResponse<me.meeshy.sdk.model.auth.PhoneRecoveryLookupData>(success = false)
        override suspend fun phoneRecoveryVerifyIdentity(body: me.meeshy.sdk.model.auth.PhoneRecoveryIdentityRequest) =
            ApiResponse<me.meeshy.sdk.model.auth.PhoneRecoveryIdentityData>(success = false)
        override suspend fun phoneRecoveryVerifyCode(body: me.meeshy.sdk.model.auth.PhoneRecoveryCodeRequest) =
            ApiResponse<me.meeshy.sdk.model.auth.PhoneRecoveryCodeData>(success = false)
        override suspend fun phoneRecoveryResend(body: me.meeshy.sdk.model.auth.PhoneRecoveryResendRequest) =
            ApiResponse<Unit>(success = true)
        override suspend fun sendPhoneCode(body: me.meeshy.sdk.model.auth.SendPhoneCodeRequest) =
            ApiResponse<Unit>(success = true)
        override suspend fun verifyPhone(body: me.meeshy.sdk.model.auth.VerifyPhoneRequest) =
            ApiResponse<me.meeshy.sdk.model.auth.VerifyPhoneData>(success = false)
        override suspend fun logout(authorization: String?, sessionToken: String?) =
            ApiResponse<Unit>(success = true)
        override suspend fun verifyTwoFactor(body: me.meeshy.sdk.net.api.TwoFactorCodeRequest) =
            ApiResponse<me.meeshy.sdk.model.auth.TwoFactorVerifyResult>(success = false)
        override suspend fun cancelTwoFactorSetup() = ApiResponse<Unit>(success = true)
        override suspend fun meSecurity(fields: String, expand: String) = meSecurityResponse
    }

    private fun session() = AuthSession(
        user = MeeshyUser(id = "u1", username = "atabeth"),
        token = "jwt-123",
        sessionToken = "sess-456",
    )

    private fun repository(
        api: AuthApi,
        store: TokenStore,
        teardown: SessionTeardown = RecordingSessionTeardown(),
        syncSeqTracker: SyncSeqTracker = SyncSeqTracker(),
    ): Pair<AuthRepository, SessionRepository> {
        val session = SessionRepository(api, store)
        return AuthRepository(api, store, session, teardown, syncSeqTracker) to session
    }

    @Test
    fun login_success_persistsTokensAndAdoptsSession() = runTest {
        val store = InMemoryTokenStore()
        val (repo, session) = repository(
            FakeAuthApi(ApiResponse(success = true, data = session())),
            store,
        )

        val result = repo.login("atabeth", "pw")

        assertThat(result.isSuccess).isTrue()
        assertThat(store.jwt).isEqualTo("jwt-123")
        assertThat(store.sessionToken).isEqualTo("sess-456")
        assertThat(repo.isAuthenticated).isTrue()
        assertThat(session.currentUser.value?.id).isEqualTo("u1")
    }

    @Test
    fun login_failure_doesNotPersistTokens() = runTest {
        val store = InMemoryTokenStore()
        val (repo, session) = repository(
            FakeAuthApi(ApiResponse(success = false, error = "Bad credentials")),
            store,
        )

        val result = repo.login("x", "y")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(store.isAuthenticated).isFalse()
        assertThat(session.currentUser.value).isNull()
    }

    @Test
    fun checkAvailability_success_forwardsOnlyTheProbedFieldAndReturnsResult() = runTest {
        val store = InMemoryTokenStore()
        val api = FakeAuthApi(
            ApiResponse(success = false),
            availabilityResponse = ApiResponse(
                success = true,
                data = AvailabilityResult(usernameAvailable = true, suggestions = listOf("atabeth1")),
            ),
        )
        val (repo, _) = repository(api, store)

        val result = repo.checkAvailability(username = "atabeth")

        assertThat(api.availabilityCalls).containsExactly(Triple("atabeth", null, null))
        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat(result.getOrNull()?.usernameAvailable).isTrue()
        assertThat(result.getOrNull()?.suggestions).containsExactly("atabeth1")
    }

    @Test
    fun checkAvailability_failure_returnsFailure() = runTest {
        val store = InMemoryTokenStore()
        val api = FakeAuthApi(
            ApiResponse(success = false),
            availabilityResponse = ApiResponse(success = false, error = "boom"),
        )
        val (repo, _) = repository(api, store)

        val result = repo.checkAvailability(email = "a@b.co")

        assertThat(api.availabilityCalls).containsExactly(Triple(null, "a@b.co", null))
        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
    }

    @Test
    fun logout_clearsTokensAndSession() = runTest {
        val store = InMemoryTokenStore(jwt = "j", sessionToken = "s")
        val (repo, session) = repository(FakeAuthApi(ApiResponse(success = false)), store)
        session.adopt(MeeshyUser(id = "u1", username = "atabeth"))

        repo.logout()

        assertThat(store.isAuthenticated).isFalse()
        assertThat(session.currentUser.value).isNull()
    }

    @Test
    fun logout_resetsTheSyncSeqCursor() = runTest {
        // `_seq` est alloué PAR USER : le curseur d'un compte ne veut rien dire
        // pour le suivant, et hérité il masquerait ses trous.
        val store = InMemoryTokenStore(jwt = "j", sessionToken = "s")
        val tracker = SyncSeqTracker()
        tracker.observe(9_000L)
        val (repo, _) = repository(
            FakeAuthApi(ApiResponse(success = false)),
            store,
            syncSeqTracker = tracker,
        )

        repo.logout()

        assertThat(tracker.lastSeq).isNull()
    }

    @Test
    fun logout_wipesEveryPerAccountCache() = runTest {
        val store = InMemoryTokenStore(jwt = "j", sessionToken = "s")
        val teardown = RecordingSessionTeardown()
        val (repo, _) = repository(FakeAuthApi(ApiResponse(success = false)), store, teardown)

        repo.logout()

        assertThat(teardown.wipeCallCount).isEqualTo(1)
    }

    // ---- register(): the two payloads served under one 200 --------------------

    @Test
    fun register_created_adoptsTheSessionAndPersistsTokens() = runTest {
        val store = InMemoryTokenStore()
        val api = FakeAuthApi(
            response = ApiResponse(success = false),
            registerResponse = ApiResponse(
                success = true,
                data = RegisterResponse(
                    user = MeeshyUser(id = "u1", username = "atabeth"),
                    token = "jwt-123",
                    sessionToken = "sess-456",
                ),
            ),
        )
        val (repo, session) = repository(api, store)

        val result = repo.register(RegisterRequest(email = "a@b.co", password = "secret"))

        assertThat(result.isSuccess).isTrue()
        assertThat(result.getOrNull()).isInstanceOf(RegisterOutcome.Created::class.java)
        assertThat(store.jwt).isEqualTo("jwt-123")
        assertThat(store.sessionToken).isEqualTo("sess-456")
        assertThat(session.currentUser.value?.id).isEqualTo("u1")
    }

    @Test
    fun register_phoneOwnershipConflict_isSuccessButAdoptsNothing() = runTest {
        val store = InMemoryTokenStore()
        val api = FakeAuthApi(
            response = ApiResponse(success = false),
            registerResponse = ApiResponse(
                success = true,
                data = RegisterResponse(phoneOwnershipConflict = true),
            ),
        )
        val (repo, session) = repository(api, store)

        val result = repo.register(RegisterRequest(email = "a@b.co", password = "secret"))

        assertThat(result.getOrNull()).isEqualTo(RegisterOutcome.PhoneOwnershipConflict)
        assertThat(store.isAuthenticated).isFalse()
        assertThat(session.currentUser.value).isNull()
    }

    @Test
    fun register_successWithNeitherSessionNorConflict_isAFailure() = runTest {
        val store = InMemoryTokenStore()
        val api = FakeAuthApi(
            response = ApiResponse(success = false),
            registerResponse = ApiResponse(success = true, data = RegisterResponse()),
        )
        val (repo, _) = repository(api, store)

        val result = repo.register(RegisterRequest(email = "a@b.co", password = "secret"))

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(store.isAuthenticated).isFalse()
    }

    @Test
    fun register_failure_doesNotPersistTokens() = runTest {
        val store = InMemoryTokenStore()
        val api = FakeAuthApi(
            response = ApiResponse(success = false),
            registerResponse = ApiResponse(success = false, error = "Email already in use", code = "EMAIL_TAKEN"),
        )
        val (repo, _) = repository(api, store)

        val result = repo.register(RegisterRequest(email = "a@b.co", password = "secret"))

        assertThat((result as? NetworkResult.Failure)?.error?.code).isEqualTo("EMAIL_TAKEN")
        assertThat(store.isAuthenticated).isFalse()
    }
    // ---- loginOutcome(): quatre issues sous un seul 200 -------------------------

    private fun sessionBody() = LoginResponse(
        user = MeeshyUser(id = "u1", username = "atabeth"),
        token = "jwt-123",
        sessionToken = "sess-456",
        expiresIn = 86_400,
    )

    private fun served(body: LoginResponse) = ApiResponse(success = true, data = body)

    private fun httpFailure(status: Int) = HttpException(Response.error<Any>(status, "".toResponseBody(null)))

    @Test
    fun loginOutcome_authenticated_storesTheSessionAndAdoptsTheUser() = runTest {
        val store = InMemoryTokenStore()
        val api = FakeAuthApi(ApiResponse(success = false)).apply { loginResponse = served(sessionBody()) }
        val (repo, session) = repository(api, store)

        val result = repo.loginOutcome("atabeth", "pw", rememberDevice = true)

        assertThat(result.getOrNull()).isInstanceOf(LoginOutcome.Authenticated::class.java)
        assertThat(store.jwt).isEqualTo("jwt-123")
        assertThat(store.sessionToken).isEqualTo("sess-456")
        assertThat(session.currentUser.value?.id).isEqualTo("u1")
    }

    @Test
    fun loginOutcome_sendsTheTypedIdentifierAndRememberDevice() = runTest {
        val api = FakeAuthApi(ApiResponse(success = false)).apply { loginResponse = served(sessionBody()) }
        val (repo, _) = repository(api, InMemoryTokenStore())

        repo.loginOutcome("atabeth", "pw", rememberDevice = true)

        assertThat(api.loginRequests).containsExactly(LoginRequest("atabeth", "pw", rememberDevice = true))
    }

    @Test
    fun loginOutcome_twoFactorRequired_storesNothing() = runTest {
        val store = InMemoryTokenStore()
        val api = FakeAuthApi(ApiResponse(success = false)).apply {
            loginResponse = served(LoginResponse(requires2FA = true, twoFactorToken = "tmp-2fa"))
        }
        val (repo, session) = repository(api, store)

        val result = repo.loginOutcome("atabeth", "pw", rememberDevice = false)

        assertThat(result.getOrNull()).isEqualTo(LoginOutcome.TwoFactorRequired("tmp-2fa"))
        assertThat(store.isAuthenticated).isFalse()
        assertThat(session.currentUser.value).isNull()
    }

    @Test
    fun loginOutcome_verificationRequired_storesNothingAndKeepsTheServedAddress() = runTest {
        val store = InMemoryTokenStore()
        val api = FakeAuthApi(ApiResponse(success = false)).apply {
            loginResponse = served(
                LoginResponse(status = "verification-required", email = "served@meeshy.me", accountCreated = true, pendingSessionToken = "pend"),
            )
        }
        val (repo, session) = repository(api, store)

        val outcome = repo.loginOutcome("typed@meeshy.me", "pw", rememberDevice = false).getOrNull()

        val pending = (outcome as LoginOutcome.VerificationRequired).pending
        assertThat(pending.email).isEqualTo("served@meeshy.me")
        assertThat(pending.accountCreated).isTrue()
        assertThat(pending.pendingSessionToken).isEqualTo("pend")
        assertThat(store.isAuthenticated).isFalse()
        assertThat(session.currentUser.value).isNull()
    }

    @Test
    fun loginOutcome_linkConfirmation_storesNothing() = runTest {
        val store = InMemoryTokenStore()
        val api = FakeAuthApi(ApiResponse(success = false)).apply {
            loginResponse = served(
                LoginResponse(requiresConfirmation = true, account = me.meeshy.sdk.model.auth.LinkSignInAccount("u9", "bob")),
            )
        }
        val (repo, _) = repository(api, store)

        val outcome = repo.loginOutcome("x", "y", rememberDevice = false).getOrNull()

        assertThat(outcome).isInstanceOf(LoginOutcome.LinkConfirmationRequired::class.java)
        assertThat(store.isAuthenticated).isFalse()
    }

    @Test
    fun loginOutcome_unknownStatus_isATypedUnsupportedFailure() = runTest {
        val store = InMemoryTokenStore()
        val api = FakeAuthApi(ApiResponse(success = false)).apply {
            loginResponse = served(LoginResponse(status = "device-check-required", email = "a@b.co"))
        }
        val (repo, _) = repository(api, store)

        val result = repo.loginOutcome("x", "y", rememberDevice = false)

        assertThat((result as NetworkResult.Failure).error.code).isEqualTo(AuthFailureCode.UNSUPPORTED_RESPONSE)
        assertThat(store.isAuthenticated).isFalse()
    }

    @Test
    fun loginOutcome_gatewayRefusal_isPropagatedWithItsCode() = runTest {
        val api = FakeAuthApi(ApiResponse(success = false)).apply {
            loginResponse = ApiResponse(success = false, error = "Identifiants invalides", code = "INVALID_CREDENTIALS")
        }
        val (repo, _) = repository(api, InMemoryTokenStore())

        val result = repo.loginOutcome("x", "y", rememberDevice = false)

        assertThat((result as NetworkResult.Failure).error.code).isEqualTo("INVALID_CREDENTIALS")
    }

    // ---- login() : la porte de l'ecran actuel ne change pas -----------------------

    @Test
    fun login_twoFactorRequired_isATypedFailureAndStoresNothing() = runTest {
        val store = InMemoryTokenStore()
        val api = FakeAuthApi(ApiResponse(success = false)).apply {
            loginResponse = served(LoginResponse(requires2FA = true, twoFactorToken = "tmp-2fa"))
        }
        val (repo, _) = repository(api, store)

        val result = repo.login("atabeth", "pw")

        assertThat((result as NetworkResult.Failure).error.code).isEqualTo(AuthFailureCode.TWO_FACTOR_REQUIRED)
        assertThat(store.isAuthenticated).isFalse()
    }

    @Test
    fun login_verificationRequired_isATypedFailure() = runTest {
        val api = FakeAuthApi(ApiResponse(success = false)).apply {
            loginResponse = served(LoginResponse(status = "verification-required", email = "a@b.co"))
        }
        val (repo, _) = repository(api, InMemoryTokenStore())

        val result = repo.login("a@b.co", "pw")

        assertThat((result as NetworkResult.Failure).error.code).isEqualTo(AuthFailureCode.VERIFICATION_REQUIRED)
    }

    @Test
    fun login_confirmationRequired_isATypedFailure() = runTest {
        val api = FakeAuthApi(ApiResponse(success = false)).apply {
            loginResponse = served(
                LoginResponse(requiresConfirmation = true, account = me.meeshy.sdk.model.auth.LinkSignInAccount("u9", "bob")),
            )
        }
        val (repo, _) = repository(api, InMemoryTokenStore())

        val result = repo.login("x", "y")

        assertThat((result as NetworkResult.Failure).error.code).isEqualTo(AuthFailureCode.LINK_CONFIRMATION_REQUIRED)
    }

    @Test
    fun login_keepsTheBaseDeviceTrustItAlwaysHad() = runTest {
        val api = FakeAuthApi(ApiResponse(success = true, data = session()))
        val (repo, _) = repository(api, InMemoryTokenStore())

        repo.login("atabeth", "pw")

        assertThat(api.loginRequests.single().rememberDevice).isFalse()
    }

    // ---- completeLoginWith2FA() ------------------------------------------------------

    @Test
    fun completeLoginWith2FA_success_storesTheSession() = runTest {
        val store = InMemoryTokenStore()
        val api = FakeAuthApi(ApiResponse(success = false)).apply { twoFactorResponse = served(sessionBody()) }
        val (repo, session) = repository(api, store)

        val result = repo.completeLoginWith2FA("tmp-2fa", "123456")

        assertThat(result.getOrNull()?.token).isEqualTo("jwt-123")
        assertThat(store.jwt).isEqualTo("jwt-123")
        assertThat(store.sessionToken).isEqualTo("sess-456")
        assertThat(session.currentUser.value?.id).isEqualTo("u1")
        assertThat(api.twoFactorRequests).containsExactly(TwoFactorLoginRequest("tmp-2fa", "123456"))
    }

    @Test
    fun completeLoginWith2FA_invalidCode_isPropagatedAsIsAndStoresNothing() = runTest {
        val store = InMemoryTokenStore()
        val api = FakeAuthApi(ApiResponse(success = false)).apply {
            twoFactorResponse = ApiResponse(success = false, error = "Code invalide", code = "INVALID_2FA_CODE")
        }
        val (repo, _) = repository(api, store)

        val result = repo.completeLoginWith2FA("tmp-2fa", "000000")

        val error = (result as NetworkResult.Failure).error
        assertThat(error.code).isEqualTo("INVALID_2FA_CODE")
        assertThat(error.message).isEqualTo("Code invalide")
        assertThat(store.isAuthenticated).isFalse()
    }

    @Test
    fun completeLoginWith2FA_tooManyAttempts_isPropagatedAsIs() = runTest {
        val api = FakeAuthApi(ApiResponse(success = false)).apply {
            twoFactorResponse = ApiResponse(success = false, error = "Trop de tentatives", code = "TWO_FACTOR_ATTEMPTS_EXHAUSTED")
        }
        val (repo, _) = repository(api, InMemoryTokenStore())

        val result = repo.completeLoginWith2FA("tmp-2fa", "123456")

        assertThat((result as NetworkResult.Failure).error.code).isEqualTo("TWO_FACTOR_ATTEMPTS_EXHAUSTED")
    }

    @Test
    fun completeLoginWith2FA_answerWithoutASession_isATypedFailureAndStoresNothing() = runTest {
        val store = InMemoryTokenStore()
        val api = FakeAuthApi(ApiResponse(success = false)).apply { twoFactorResponse = served(LoginResponse()) }
        val (repo, _) = repository(api, store)

        val result = repo.completeLoginWith2FA("tmp-2fa", "123456")

        assertThat((result as NetworkResult.Failure).error.code).isEqualTo(AuthFailureCode.UNSUPPORTED_RESPONSE)
        assertThat(store.isAuthenticated).isFalse()
    }

    // ---- confirmEmail() tient la session, adoptSession() la pose ----------------------

    @Test
    fun confirmEmail_returnsTheSessionWithoutAdoptingIt() = runTest {
        val store = InMemoryTokenStore()
        val api = FakeAuthApi(ApiResponse(success = false)).apply { verifyEmailResponse = served(sessionBody()) }
        val (repo, session) = repository(api, store)

        val outcome = repo.confirmEmail(EmailVerificationRequest.code("123456", email = "a@b.co")).getOrNull()

        assertThat(outcome).isInstanceOf(LoginOutcome.Authenticated::class.java)
        assertThat(store.isAuthenticated).isFalse()
        assertThat(session.currentUser.value).isNull()
        assertThat(api.verifyEmailRequests).containsExactly(EmailVerificationRequest.code("123456", email = "a@b.co"))
    }

    @Test
    fun adoptSession_storesTheHeldSession() = runTest {
        val store = InMemoryTokenStore()
        val (repo, session) = repository(FakeAuthApi(ApiResponse(success = false)), store)

        repo.adoptSession(AuthSession(user = MeeshyUser(id = "u1", username = "atabeth"), token = "jwt-1", sessionToken = "sess-1"))

        assertThat(store.jwt).isEqualTo("jwt-1")
        assertThat(store.sessionToken).isEqualTo("sess-1")
        assertThat(session.currentUser.value?.id).isEqualTo("u1")
    }

    @Test
    fun confirmEmail_secondFactorChallenge_isReturnedNotAdopted() = runTest {
        val store = InMemoryTokenStore()
        val api = FakeAuthApi(ApiResponse(success = false)).apply {
            verifyEmailResponse = served(LoginResponse(requires2FA = true, twoFactorToken = "tmp", adoptWithinSeconds = 300))
        }
        val (repo, _) = repository(api, store)

        val outcome = repo.confirmEmail(EmailVerificationRequest.link("tok", email = "a@b.co")).getOrNull()

        assertThat(outcome).isEqualTo(LoginOutcome.TwoFactorRequired("tmp", adoptWithinSeconds = 300))
        assertThat(store.isAuthenticated).isFalse()
    }

    // ---- lien magique ------------------------------------------------------------------

    @Test
    fun magicLinkOutcome_confirmationRequired_storesNothingAndSendsTheDeviceSecret() = runTest {
        val store = InMemoryTokenStore()
        val api = FakeAuthApi(ApiResponse(success = false)).apply {
            magicLinkResponse = served(
                LoginResponse(requiresConfirmation = true, account = me.meeshy.sdk.model.auth.LinkSignInAccount("u9", "bob")),
            )
        }
        val (repo, _) = repository(api, store)

        val outcome = repo.magicLinkOutcome("tok", linkDeviceSecret = "secret", confirmed = true).getOrNull()

        assertThat(outcome).isInstanceOf(LoginOutcome.LinkConfirmationRequired::class.java)
        assertThat(store.isAuthenticated).isFalse()
        assertThat(api.magicLinkRequests).containsExactly(MagicLinkValidateRequest("tok", "secret", true))
    }

    @Test
    fun loginWithMagicLink_session_keepsStoringItForTheCurrentScreen() = runTest {
        val store = InMemoryTokenStore()
        val api = FakeAuthApi(ApiResponse(success = false)).apply { magicLinkResponse = served(sessionBody()) }
        val (repo, _) = repository(api, store)

        val result = repo.loginWithMagicLink("tok")

        assertThat(result.getOrNull()?.token).isEqualTo("jwt-123")
        assertThat(store.jwt).isEqualTo("jwt-123")
        assertThat(api.magicLinkRequests).containsExactly(MagicLinkValidateRequest("tok"))
    }

    @Test
    fun loginWithMagicLink_confirmationRequired_isATypedFailure() = runTest {
        val api = FakeAuthApi(ApiResponse(success = false)).apply {
            magicLinkResponse = served(
                LoginResponse(requiresConfirmation = true, account = me.meeshy.sdk.model.auth.LinkSignInAccount("u9", "bob")),
            )
        }
        val (repo, _) = repository(api, InMemoryTokenStore())

        val result = repo.loginWithMagicLink("tok")

        assertThat((result as NetworkResult.Failure).error.code).isEqualTo(AuthFailureCode.LINK_CONFIRMATION_REQUIRED)
    }

    // ---- attente d'une preuve ------------------------------------------------------------

    @Test
    fun emailVerificationStatus_provenAndPending() = runTest {
        val api = FakeAuthApi(ApiResponse(success = false))
        val (repo, _) = repository(api, InMemoryTokenStore())

        api.verificationStatusResponse = ApiResponse(success = true, data = VerificationStatusData("proven"))
        assertThat(repo.emailVerificationStatus("pend").getOrNull()).isEqualTo(EmailVerificationWatchStatus.PROVEN)

        api.verificationStatusResponse = ApiResponse(success = true, data = VerificationStatusData("pending"))
        assertThat(repo.emailVerificationStatus("pend").getOrNull()).isEqualTo(EmailVerificationWatchStatus.PENDING)

        api.verificationStatusResponse = ApiResponse(success = true, data = VerificationStatusData("quelque-chose-de-neuf"))
        assertThat(repo.emailVerificationStatus("pend").getOrNull()).isEqualTo(EmailVerificationWatchStatus.PENDING)
    }

    @Test
    fun emailVerificationStatus_unknownOrExpiredToken_endsTheWait() = runTest {
        val api = FakeAuthApi(ApiResponse(success = false))
        val (repo, _) = repository(api, InMemoryTokenStore())

        api.verificationStatusFailure = httpFailure(401)
        assertThat(repo.emailVerificationStatus("pend").getOrNull()).isEqualTo(EmailVerificationWatchStatus.ENDED)

        api.verificationStatusFailure = httpFailure(410)
        assertThat(repo.emailVerificationStatus("pend").getOrNull()).isEqualTo(EmailVerificationWatchStatus.ENDED)
    }

    @Test
    fun emailVerificationStatus_aTransientFailureIsNotTheEndOfTheWait() = runTest {
        val api = FakeAuthApi(ApiResponse(success = false))
        val (repo, _) = repository(api, InMemoryTokenStore())
        api.verificationStatusFailure = httpFailure(503)

        val result = repo.emailVerificationStatus("pend")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
    }

    // ---- reinitialisation, mot de passe ----------------------------------------------------

    @Test
    fun verifyResetToken_decodesTheVerdict() = runTest {
        val api = FakeAuthApi(ApiResponse(success = false)).apply {
            resetTokenResponse = ApiResponse(success = true, data = ResetTokenVerification(valid = true, requires2FA = true))
        }
        val (repo, _) = repository(api, InMemoryTokenStore())

        val verdict = repo.verifyResetToken("reset-1").getOrNull()

        assertThat(verdict).isEqualTo(ResetTokenVerification(valid = true, requires2FA = true))
    }

    @Test
    fun submitPasswordReset_sendsTheConfirmationAndTheSecondFactorCode() = runTest {
        val api = FakeAuthApi(ApiResponse(success = false))
        val (repo, _) = repository(api, InMemoryTokenStore())

        val result = repo.submitPasswordReset("reset-1", "Neuf#2026x", twoFactorCode = "123456")

        assertThat(result.isSuccess).isTrue()
        assertThat(api.resetRequests).containsExactly(
            ResetPasswordRequest("reset-1", "Neuf#2026x", "Neuf#2026x", twoFactorCode = "123456"),
        )
    }

    @Test
    fun hasPassword_readsTheSecuritySummary() = runTest {
        val api = FakeAuthApi(ApiResponse(success = false)).apply {
            meSecurityResponse = ApiResponse(
                success = true,
                data = MeSecurityEnvelope(MeSecurityUser(MeSecuritySummary(hasPassword = false))),
            )
        }
        val (repo, _) = repository(api, InMemoryTokenStore())

        assertThat(repo.hasPassword().getOrNull()).isFalse()
    }

    @Test
    fun hasPassword_unknownWhenTheGatewayDoesNotServeTheSummary() = runTest {
        val api = FakeAuthApi(ApiResponse(success = false)).apply {
            meSecurityResponse = ApiResponse(success = true, data = MeSecurityEnvelope(MeSecurityUser()))
        }
        val (repo, _) = repository(api, InMemoryTokenStore())

        val result = repo.hasPassword()

        assertThat(result.isSuccess).isTrue()
        assertThat(result.getOrNull()).isNull()
    }
}
