package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

/** Les deux routes de « Mes appareils chiffrés », telles qu'elles partent (#13014). */
class E2eeDeviceApiRoutesTest {

    private fun devices(http: RecordingHttp) = http.serve(E2eeDeviceApi::class.java)

    @Test
    fun `listing my devices reads the self-only devices route and keeps the data raw`() = runTest {
        val http = RecordingHttp(
            responseBody = """
                {"success":true,"data":{"devices":[{"deviceId":"2","registrationId":7,"platform":"ios","label":null,
                 "enrolledAt":"2026-10-20T08:00:00.000Z","lastSeenAt":"2026-10-25T09:30:00.000Z","current":false}]}}
            """.trimIndent(),
        )

        val response = devices(http).ownDevices()

        assertThat(http.only.method).isEqualTo("GET")
        assertThat(http.only.path).isEqualTo("/api/v1/e2ee/devices")
        val first = response.data!!.getValue("devices").jsonArray.first().jsonObject
        assertThat(first.getValue("deviceId").jsonPrimitive.isString).isTrue()
    }

    @Test
    fun `retiring a device deletes it by its device id and names the generation it was read with`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"deviceId":3,"retired":true,"sessionEnded":true}}""")

        val response = devices(http).retireDevice(3, registrationId = 4711)

        assertThat(http.only.method).isEqualTo("DELETE")
        assertThat(http.only.path).isEqualTo("/api/v1/e2ee/devices/3")
        assertThat(http.only.queryParameter("registrationId")).isEqualTo("4711")
        assertThat(response.success).isTrue()
    }
}
