package me.meeshy.sdk.auth

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.auth.ServerLogoutPolicy.Verdict
import me.meeshy.sdk.net.api.AuthApi
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import java.io.IOException

class ServerLogoutTest {

    private class Handovers : ServerLogoutScheduler {
        val calls = mutableListOf<Pair<String?, String?>>()
        override fun schedule(jwt: String?, sessionToken: String?) {
            calls += jwt to sessionToken
        }
    }

    private class Journal : ServerLogoutLog {
        val lines = mutableListOf<String>()
        override fun info(message: String) { lines += "I $message" }
        override fun warn(message: String) { lines += "W $message" }
        override fun error(message: String) { lines += "E $message" }
    }

    private fun TestScope.logout(api: AuthApi, handovers: Handovers = Handovers(), journal: Journal = Journal()) =
        ServerLogout(api, handovers, journal, backgroundScope)

    private fun http(code: Int) = HttpException(Response.error<Unit>(code, "{}".toResponseBody()))

    @Test
    fun `le jeton explicite est utilise tel quel`() = runTest {
        val api = mockk<AuthApi>()
        coEvery { api.logout(any(), any()) } returns ApiResponse(success = true)

        val verdict = logout(api).close("jwt-a", "sess-a")

        assertThat(verdict).isEqualTo(Verdict.CLOSED)
        coVerify(exactly = 1) { api.logout("Bearer jwt-a", "sess-a") }
    }

    @Test
    fun `trois essais a 0 s, 1 s et 5 s puis la main passe a la reprise`() = runTest {
        val api = mockk<AuthApi>()
        val times = mutableListOf<Long>()
        coEvery { api.logout(any(), any()) } coAnswers { times += currentTime; throw IOException("offline") }
        val handovers = Handovers()
        val journal = Journal()

        val verdict = logout(api, handovers, journal).close("jwt-a", "sess-a")

        assertThat(verdict).isNull()
        assertThat(times).containsExactly(0L, 1_000L, 6_000L).inOrder()
        assertThat(handovers.calls).containsExactly("jwt-a" to "sess-a")
        assertThat(journal.lines.joinToString()).doesNotContain("jwt-a")
    }

    @Test
    fun `un 401 arrete les essais, la session est deja close`() = runTest {
        val api = mockk<AuthApi>()
        coEvery { api.logout(any(), any()) } throws http(401)
        val handovers = Handovers()

        val verdict = logout(api, handovers).close("jwt-a", null)

        assertThat(verdict).isEqualTo(Verdict.ALREADY_CLOSED)
        coVerify(exactly = 1) { api.logout("Bearer jwt-a", null) }
        assertThat(handovers.calls).isEmpty()
    }

    @Test
    fun `un 500 puis un succes s'arrete au deuxieme essai`() = runTest {
        val api = mockk<AuthApi>()
        coEvery { api.logout(any(), any()) } throws http(500) andThen ApiResponse(success = true)

        val verdict = logout(api).close("jwt-a", "sess-a")

        assertThat(verdict).isEqualTo(Verdict.CLOSED)
        coVerify(exactly = 2) { api.logout(any(), any()) }
    }

    @Test
    fun `la fermeture en arriere-plan ne bloque pas l'appelant`() = runTest {
        val api = mockk<AuthApi>()
        coEvery { api.logout(any(), any()) } throws IOException("offline")
        val handovers = Handovers()
        val serverLogout = logout(api, handovers)

        serverLogout.closeInBackground("jwt-a", "sess-a")

        assertThat(handovers.calls).isEmpty()
        advanceTimeBy(6_001)
        runCurrent()
        assertThat(handovers.calls).hasSize(1)
    }

    @Test
    fun `sans aucun jeton il n'y a rien a fermer`() = runTest {
        val api = mockk<AuthApi>()

        logout(api).closeInBackground(null, null)
        advanceTimeBy(6_001)
        runCurrent()

        coVerify(exactly = 0) { api.logout(any(), any()) }
    }
}
