package me.meeshy.sdk.e2ee

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.e2ee.ConversationEncryptionModeChoice
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ConversationEncryptionApi
import me.meeshy.sdk.net.api.SetEncryptionModeBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

/** Le régime d'une conversation (#12522, #12949) : décodé strictement, appris quand il est e2ee, jamais quitté. */
class ConversationEncryptionRepositoryTest {

    private fun obj(text: String) = Json.parseToJsonElement(text) as JsonObject

    private fun served(mode: String?, canToggle: Boolean = true) = ApiResponse(
        true,
        obj(
            """{"isEncrypted":${mode != null},"mode":${mode?.let { "\"$it\"" } ?: "null"},"enabledAt":null,""" +
                """"canTranslate":${mode == "server"},"canToggleEncryption":$canToggle,"pairEndToEndConversationId":null}""",
        ),
    )

    private class FakeApi(
        var status: suspend () -> ApiResponse<JsonObject> = { error("unused") },
        var enable: suspend (SetEncryptionModeBody) -> ApiResponse<JsonObject> = { error("unused") },
        var disable: suspend () -> ApiResponse<JsonObject> = { error("unused") },
    ) : ConversationEncryptionApi {
        var calls = 0
        val enabled = mutableListOf<String>()
        override suspend fun status(conversationId: String): ApiResponse<JsonObject> { calls += 1; return status() }
        override suspend fun enable(conversationId: String, body: SetEncryptionModeBody): ApiResponse<JsonObject> {
            calls += 1
            enabled += body.mode
            return enable(body)
        }
        override suspend fun disable(conversationId: String): ApiResponse<JsonObject> { calls += 1; return disable() }
    }

    private fun repository(api: FakeApi, ledger: EndToEndRegimeLedger = InMemoryEndToEndRegimeLedger()) =
        ConversationEncryptionRepository(api, ledger)

    private fun http(code: Int, body: String) = HttpException(
        Response.error<Any>(code, body.toResponseBody("application/json".toMediaType())),
    )

    @Test
    fun `reading an end to end conversation teaches the ledger, a server one teaches nothing`() = runTest {
        val ledger = InMemoryEndToEndRegimeLedger()
        val api = FakeApi(status = { served("e2ee") })
        repository(api, ledger).status("c1")
        repository(FakeApi(status = { served("server") }), ledger).status("c2")

        assertThat(ledger.isSealed("c1")).isTrue()
        assertThat(ledger.isSealed("c2")).isFalse()
    }

    @Test
    fun `a malformed status is a failure, never a guess`() = runTest {
        val api = FakeApi(status = { ApiResponse(true, obj("""{"isEncrypted":"true","canTranslate":true}""")) })

        val result = repository(api).status("c1")

        assertThat((result as NetworkResult.Failure).error.code).isEqualTo("MALFORMED_RESPONSE")
    }

    @Test
    fun `activating a server mode posts it and returns the served regime`() = runTest {
        val api = FakeApi(enable = { served("hybrid") })

        val result = repository(api).enable("c1", ConversationEncryptionModeChoice.HYBRID)

        assertThat(api.enabled).containsExactly("hybrid")
        assertThat((result as NetworkResult.Success).data.mode).isEqualTo("hybrid")
    }

    @Test
    fun `this phone never activates end to end, and does not even ask the gateway`() = runTest {
        val api = FakeApi()

        val result = repository(api).enable("c1", ConversationEncryptionModeChoice.E2EE)

        assertThat((result as NetworkResult.Failure).error.code).isEqualTo(ConversationEncryptionRepository.NOT_AVAILABLE_ON_THIS_PHONE)
        assertThat(api.calls).isEqualTo(0)
    }

    @Test
    fun `a conversation this device saw end to end is never switched, locally refused before the network`() = runTest {
        val ledger = InMemoryEndToEndRegimeLedger().also { it.learn("c1") }
        val api = FakeApi()

        val enabled = repository(api, ledger).enable("c1", ConversationEncryptionModeChoice.SERVER)
        val disabled = repository(api, ledger).disable("c1")

        assertThat((enabled as NetworkResult.Failure).error.code).isEqualTo(ConversationEncryptionRepository.IRREVERSIBLE)
        assertThat((disabled as NetworkResult.Failure).error.code).isEqualTo(ConversationEncryptionRepository.IRREVERSIBLE)
        assertThat(api.calls).isEqualTo(0)
    }

    @Test
    fun `deactivating the at-rest regime returns the clear regime`() = runTest {
        val api = FakeApi(disable = { served(null) })

        val result = repository(api).disable("c1")

        assertThat((result as NetworkResult.Success).data.isEncrypted).isFalse()
    }

    @Test
    fun `the gateway refusal keeps its stable code`() = runTest {
        val api = FakeApi(
            disable = {
                throw http(409, """{"success":false,"error":"irreversible","code":"E2EE_IRREVERSIBLE"}""")
            },
        )

        val result = repository(api).disable("c1")

        assertThat((result as NetworkResult.Failure).error.code).isEqualTo(ConversationEncryptionRepository.IRREVERSIBLE)
    }

    @Test
    fun `a gateway that answers irreversible teaches the ledger that this conversation is end to end`() = runTest {
        val ledger = InMemoryEndToEndRegimeLedger()
        val api = FakeApi(
            enable = { throw http(409, """{"success":false,"error":"x","code":"E2EE_IRREVERSIBLE"}""") },
        )

        repository(api, ledger).enable("c1", ConversationEncryptionModeChoice.SERVER)

        assertThat(ledger.isSealed("c1")).isTrue()
    }
}
