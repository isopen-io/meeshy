package me.meeshy.sdk.auth

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.auth.TwoFactorVerifyResult
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.net.api.TwoFactorBackupCodesInfo
import me.meeshy.sdk.net.api.TwoFactorCodeRequest
import me.meeshy.sdk.net.api.TwoFactorDisableRequest
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.session.SessionTeardown
import me.meeshy.sdk.sync.SyncSeqTracker
import org.junit.Test

class AuthRepositoryTwoFactorTest {

    private fun repository(api: AuthApi): AuthRepository {
        val store = InMemoryTokenStore()
        return AuthRepository(
            api,
            store,
            SessionRepository(api, store),
            object : SessionTeardown { override suspend fun wipe() = Unit },
            SyncSeqTracker(),
        )
    }

    @Test
    fun `verifyTwoFactor poste le code sur auth 2fa verify`() = runTest {
        val api = mockk<AuthApi>()
        coEvery { api.verifyTwoFactor(TwoFactorCodeRequest("123456")) } returns
            ApiResponse(success = true, data = TwoFactorVerifyResult(valid = true))

        val result = repository(api).verifyTwoFactor("123456")

        assertThat((result as NetworkResult.Success).data.valid).isTrue()
        coVerify(exactly = 1) { api.verifyTwoFactor(TwoFactorCodeRequest("123456")) }
    }

    @Test
    fun `enableTwoFactor rend les codes de secours`() = runTest {
        val api = mockk<AuthApi>()
        coEvery { api.enableTwoFactor(TwoFactorCodeRequest("123456")) } returns
            ApiResponse(success = true, data = TwoFactorBackupCodesInfo(backupCodes = listOf("AAAA1111")))

        val result = repository(api).enableTwoFactor("123456")

        assertThat((result as NetworkResult.Success).data.backupCodes).containsExactly("AAAA1111")
    }

    @Test
    fun `disableTwoFactor envoie le mot de passe et le code`() = runTest {
        val api = mockk<AuthApi>()
        coEvery { api.disableTwoFactor(TwoFactorDisableRequest("secret", "654321")) } returns
            ApiResponse(success = true)

        val result = repository(api).disableTwoFactor("secret", "654321")

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        coVerify(exactly = 1) { api.disableTwoFactor(TwoFactorDisableRequest("secret", "654321")) }
    }

    @Test
    fun `regenerateTwoFactorBackupCodes envoie le code 2FA`() = runTest {
        val api = mockk<AuthApi>()
        coEvery { api.regenerateTwoFactorBackupCodes(TwoFactorCodeRequest("111222")) } returns
            ApiResponse(success = true, data = TwoFactorBackupCodesInfo(backupCodes = listOf("NEW00001", "NEW00002")))

        val result = repository(api).regenerateTwoFactorBackupCodes("111222")

        assertThat((result as NetworkResult.Success).data.backupCodes).containsExactly("NEW00001", "NEW00002").inOrder()
    }

    @Test
    fun `un refus du serveur sur enable est un échec`() = runTest {
        val api = mockk<AuthApi>()
        coEvery { api.enableTwoFactor(any()) } returns ApiResponse(success = false, error = "bad", code = "INVALID_CODE")

        assertThat(repository(api).enableTwoFactor("000000")).isInstanceOf(NetworkResult.Failure::class.java)
    }
}
