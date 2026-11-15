package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test
import java.io.IOException

/**
 * [AccountDeletionApi] is a one-line forward to [UserApi.openAccountDeletion] through
 * [me.meeshy.sdk.net.apiCall] — these tests pin the two things that forward can get
 * wrong: which endpoint and body it calls, and that [apiCall]'s envelope/exception
 * folding is actually wired in (not bypassed).
 */
class AccountDeletionApiTest {

    @Test
    fun open_sendsThePhraseAndPasswordVerbatim() = runTest {
        val userApi = mockk<UserApi>()
        coEvery { userApi.openAccountDeletion(any()) } returns
            ApiResponse(success = true, data = AccountDeletionOpenedResponse(message = "sent"))
        val sut = AccountDeletionApi(userApi)

        sut.open(confirmationPhrase = "SUPPRIMER MON COMPTE", currentPassword = "hunter2")

        coVerify(exactly = 1) {
            userApi.openAccountDeletion(
                OpenAccountDeletionRequest(
                    confirmationPhrase = "SUPPRIMER MON COMPTE",
                    currentPassword = "hunter2",
                ),
            )
        }
    }

    @Test
    fun open_success_unwrapsTheResponse() = runTest {
        val userApi = mockk<UserApi>()
        val response = AccountDeletionOpenedResponse(message = "sent", tokenExpiresAt = "2026-09-05T00:00:00Z")
        coEvery { userApi.openAccountDeletion(any()) } returns ApiResponse(success = true, data = response)
        val sut = AccountDeletionApi(userApi)

        val result = sut.open("SUPPRIMER MON COMPTE", "hunter2")

        assertThat(result).isEqualTo(NetworkResult.Success(response))
    }

    @Test
    fun open_serverRefusal_isFailureWithTheGatewayCode() = runTest {
        val userApi = mockk<UserApi>()
        coEvery { userApi.openAccountDeletion(any()) } returns
            ApiResponse(success = false, error = "Mot de passe incorrect", code = "INVALID_PASSWORD")
        val sut = AccountDeletionApi(userApi)

        val result = sut.open("SUPPRIMER MON COMPTE", "wrong") as NetworkResult.Failure

        assertThat(result.error.code).isEqualTo("INVALID_PASSWORD")
        assertThat(result.error.message).isEqualTo("Mot de passe incorrect")
    }

    @Test
    fun open_transportFailure_isNetworkFailure() = runTest {
        val userApi = mockk<UserApi>()
        coEvery { userApi.openAccountDeletion(any()) } throws IOException("offline")
        val sut = AccountDeletionApi(userApi)

        val result = sut.open("SUPPRIMER MON COMPTE", "hunter2") as NetworkResult.Failure

        assertThat(result.error.code).isEqualTo("NETWORK")
    }
}
