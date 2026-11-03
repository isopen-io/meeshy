package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.outbox.OutboxSentinelTargets
import me.meeshy.sdk.net.api.SettingsActionApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.SettingsActionPayload
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class AccountKindsSendersTest {

    private val api = mockk<SettingsActionApi>()
    private val handler = SettingsActionHandler(api, senderJson)
    private val body = JsonObject(mapOf("theme" to JsonPrimitive("dark")))

    private fun row(method: String = "PATCH", endpoint: String = "/me/preferences/application") = outboxRow(
        OutboxKind.SETTINGS_ACTION,
        targetId = OutboxSentinelTargets.settingsAction(method, endpoint),
        payload = encodedPayload(SettingsActionPayload(method, endpoint, body)),
    )

    private fun refusal(status: Int, body: String = "{}") =
        HttpException(Response.error<ApiResponse<JsonElement>>(status, body.toResponseBody()))

    @Test
    fun `a patch is sent to the relative endpoint with its body`() = runTest {
        coEvery { api.patch("me/preferences/application", body) } returns accepted<JsonElement>(JsonObject(emptyMap()))

        val result = handler.send(row())

        assertThat(result).isEqualTo(SendResult.Success)
        coVerify { api.patch("me/preferences/application", body) }
    }

    @Test
    fun `an acknowledgement without data still succeeds`() = runTest {
        coEvery { api.put("me/x", body) } returns ApiResponse<JsonElement>(success = true)

        assertThat(handler.send(row("PUT", "me/x"))).isEqualTo(SendResult.Success)
    }

    @Test
    fun `a 4xx is definitive and a 5xx is retried`() = runTest {
        coEvery { api.post("me/x", body) } throws refusal(403, """{"success":false,"error":"Forbidden","code":"FORBIDDEN"}""")
        assertThat(handler.send(row("POST", "me/x"))).isInstanceOf(SendResult.PermanentFailure::class.java)

        coEvery { api.post("me/x", body) } throws refusal(503)
        assertThat(handler.send(row("POST", "me/x"))).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `an unknown method or an absolute url is never sent`() = runTest {
        assertThat(handler.send(row("TRACE", "me/x"))).isInstanceOf(SendResult.PermanentFailure::class.java)
        assertThat(handler.send(row("PATCH", "https://evil.example/x"))).isInstanceOf(SendResult.PermanentFailure::class.java)
    }

    @Test
    fun `an undecodable payload is a permanent failure`() = runTest {
        val bad = outboxRow(OutboxKind.SETTINGS_ACTION, payload = "nope")

        assertThat(handler.send(bad)).isInstanceOf(SendResult.PermanentFailure::class.java)
    }
}
