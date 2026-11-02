package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

class HealthApiRoutesTest {

    @Test
    fun `la sonde appelle health ready et lit le verdict`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"status":"ready"}}""")

        val response = http.serve(HealthApi::class.java).ready()

        assertThat(http.only.method).isEqualTo("GET")
        assertThat(http.only.path).isEqualTo("/api/v1/health/ready")
        assertThat(response.data!!.status).isEqualTo("ready")
    }
}
