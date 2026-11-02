package me.meeshy.sdk.report

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.health.ConnectionDiagnosis
import me.meeshy.sdk.model.health.ReadyProbe
import me.meeshy.sdk.net.api.HealthApi
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import java.io.IOException

class ConnectionDiagnosticRepositoryTest {

    private fun diagnose(block: suspend () -> ApiResponse<ReadyProbe>): ConnectionDiagnosis {
        val api = mockk<HealthApi>()
        coEvery { api.ready() } coAnswers { block() }
        return kotlinx.coroutines.runBlocking { ConnectionDiagnosticRepository(api).diagnose() }
    }

    @Test
    fun `ready est un serveur sain`() = runTest {
        val d = diagnose { ApiResponse(success = true, data = ReadyProbe("ready")) }
        assertThat(d).isEqualTo(ConnectionDiagnosis.HEALTHY)
    }

    @Test
    fun `un 503 not-ready est un serveur degrade`() = runTest {
        val d = diagnose {
            throw HttpException(Response.error<Any>(503, """{"success":false,"error":"not-ready","code":"NOT_READY"}""".toResponseBody()))
        }
        assertThat(d).isEqualTo(ConnectionDiagnosis.DEGRADED)
    }

    @Test
    fun `une panne de transport est un serveur injoignable`() = runTest {
        val d = diagnose { throw IOException("Unable to resolve host") }
        assertThat(d).isEqualTo(ConnectionDiagnosis.UNREACHABLE)
    }
}
