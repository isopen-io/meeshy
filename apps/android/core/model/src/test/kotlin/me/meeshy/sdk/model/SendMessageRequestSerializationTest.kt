package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Test

class SendMessageRequestSerializationTest {

    private val json = Json { encodeDefaults = false; ignoreUnknownKeys = true }

    private fun request(copyFrom: String? = null) =
        SendMessageRequest(content = "salut", originalLanguage = "fr", clientMessageId = "cid_target", copyAttachmentsFromMessageId = copyFrom)

    @Test
    fun `une cible de fan-out serialise copyAttachmentsFromMessageId`() {
        val body = json.encodeToString(request("msg_origin"))
        assertThat(body).contains("\"copyAttachmentsFromMessageId\":\"msg_origin\"")
    }

    @Test
    fun `un envoi ordinaire n'a aucune cle copyAttachmentsFromMessageId`() {
        assertThat(json.encodeToString(request())).doesNotContain("copyAttachmentsFromMessageId")
    }

    @Test
    fun `la cle revient intacte a la lecture et une vieille ligne sans cle se lit nulle`() {
        assertThat(json.decodeFromString<SendMessageRequest>(json.encodeToString(request("m9"))).copyAttachmentsFromMessageId)
            .isEqualTo("m9")
        val oldRow = """{"content":"x","originalLanguage":"fr","clientMessageId":"cid_old"}"""
        assertThat(json.decodeFromString<SendMessageRequest>(oldRow).copyAttachmentsFromMessageId).isNull()
    }
}
