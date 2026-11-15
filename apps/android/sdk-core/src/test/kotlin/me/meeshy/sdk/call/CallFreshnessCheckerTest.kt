package me.meeshy.sdk.call

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.call.ActiveCallSession
import me.meeshy.sdk.model.call.CallFreshness
import me.meeshy.sdk.net.api.CallApi
import org.junit.Test

class CallFreshnessCheckerTest {

    private val api: CallApi = mockk()
    private val checker = CallFreshnessChecker(api)

    private fun session(status: String) =
        ActiveCallSession(id = "c1", conversationId = "conv", mode = "p2p", status = status)

    @Test
    fun `un appel actif est vivant`() = runTest {
        coEvery { api.details("c1") } returns ApiResponse(success = true, data = session("active"))
        assertThat(checker.check("c1")).isEqualTo(CallFreshness.Live)
    }

    @Test
    fun `un appel fini est periment`() = runTest {
        coEvery { api.details("c1") } returns ApiResponse(success = true, data = session("ended"))
        assertThat(checker.check("c1")).isEqualTo(CallFreshness.Finished)
    }

    @Test
    fun `une erreur reseau retombe sur sonner`() = runTest {
        coEvery { api.details("c1") } throws java.io.IOException("offline")
        assertThat(checker.check("c1")).isEqualTo(CallFreshness.Live)
    }

    @Test
    fun `un echec serveur retombe sur sonner`() = runTest {
        coEvery { api.details("c1") } returns ApiResponse(success = false, data = null)
        assertThat(checker.check("c1")).isEqualTo(CallFreshness.Live)
    }
}
