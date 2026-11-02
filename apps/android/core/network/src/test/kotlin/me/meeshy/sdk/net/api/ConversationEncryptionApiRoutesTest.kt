package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.net.isNeverRetried
import org.junit.Test

/** Les trois routes du régime de chiffrement d'une conversation, telles qu'elles partent (#12522, #13463). */
class ConversationEncryptionApiRoutesTest {

    private val status = """{"success":true,"data":{"isEncrypted":true,"mode":"server","canTranslate":true,"canToggleEncryption":true}}"""

    private fun api(http: RecordingHttp) = http.serve(ConversationEncryptionApi::class.java)

    @Test
    fun `reading the status is a GET on the conversation and keeps the data raw`() = runTest {
        val http = RecordingHttp(responseBody = status)

        val response = api(http).status("c1")

        assertThat(http.only.method).isEqualTo("GET")
        assertThat(http.only.path).isEqualTo("/api/v1/conversations/c1/encryption-status")
        assertThat(response.data!!.getValue("mode").jsonPrimitive.content).isEqualTo("server")
    }

    @Test
    fun `enabling posts the chosen mode and is never replayed`() = runTest {
        val http = RecordingHttp(responseBody = status)

        api(http).enable("c1", SetEncryptionModeBody("hybrid"))

        assertThat(http.only.method).isEqualTo("POST")
        assertThat(http.only.path).isEqualTo("/api/v1/conversations/c1/encryption")
        assertThat(kotlinx.serialization.json.Json.parseToJsonElement(http.only.body!!).jsonObject.getValue("mode").jsonPrimitive.content)
            .isEqualTo("hybrid")
        assertThat(http.only.request.isNeverRetried()).isTrue()
    }

    @Test
    fun `disabling deletes the at-rest regime and is never replayed`() = runTest {
        val http = RecordingHttp(responseBody = status)

        api(http).disable("c1")

        assertThat(http.only.method).isEqualTo("DELETE")
        assertThat(http.only.path).isEqualTo("/api/v1/conversations/c1/encryption")
        assertThat(http.only.request.isNeverRetried()).isTrue()
    }
}
