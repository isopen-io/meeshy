package me.meeshy.sdk.model.e2ee

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Test

/** La charge de `GET /conversations/:id/encryption-status` telle que `encryptionStatusView` la sert (#12522). */
class ConversationEncryptionStatusTest {

    private fun data(json: String): JsonObject = Json.parseToJsonElement(json).jsonObject

    private fun served(
        isEncrypted: String = "true",
        mode: String = "\"server\"",
        enabledAt: String = "\"2026-10-20T08:00:00.000Z\"",
        canTranslate: String = "true",
        canToggle: String = "true",
        pair: String = "null",
        extra: String = "",
    ) = data(
        """{"isEncrypted":$isEncrypted,"mode":$mode,"enabledAt":$enabledAt,"enabledBy":"u1","canTranslate":$canTranslate,""" +
            """"epoch":3,"canToggleEncryption":$canToggle,"canDisableEncryption":true,"pairEndToEndConversationId":$pair$extra}""",
    )

    @Test
    fun `decodes the served regime, ignoring a key it does not know`() {
        val status = ConversationEncryptionStatusDecoder.decode(served(extra = ",\"futur\":1"))

        assertThat(status).isEqualTo(
            ConversationEncryptionStatus(
                isEncrypted = true,
                mode = "server",
                enabledAt = Instant.parse("2026-10-20T08:00:00Z"),
                canTranslate = true,
                canToggleEncryption = true,
                pairEndToEndConversationId = null,
            ),
        )
    }

    @Test
    fun `a clear conversation is served with a null mode and no date`() {
        val status = ConversationEncryptionStatusDecoder.decode(
            served(isEncrypted = "false", mode = "null", enabledAt = "null", canTranslate = "false", canToggle = "false"),
        )

        assertThat(status?.isEncrypted).isFalse()
        assertThat(status?.mode).isNull()
        assertThat(status?.enabledAt).isNull()
    }

    @Test
    fun `a gateway that does not serve the toggle right leaves it unknown, never granted`() {
        val status = ConversationEncryptionStatusDecoder.decode(
            data("""{"isEncrypted":true,"mode":"server","canTranslate":true}"""),
        )

        assertThat(status?.canToggleEncryption).isNull()
    }

    @Test
    fun `a coerced flag is a malformed answer, never a guess`() {
        assertThat(ConversationEncryptionStatusDecoder.decode(served(isEncrypted = "\"true\""))).isNull()
        assertThat(ConversationEncryptionStatusDecoder.decode(served(canToggle = "\"true\""))).isNull()
        assertThat(ConversationEncryptionStatusDecoder.decode(data("""{"mode":"server"}"""))).isNull()
    }

    @Test
    fun `an unreadable date is a malformed answer`() {
        assertThat(ConversationEncryptionStatusDecoder.decode(served(enabledAt = "\"hier\""))).isNull()
    }

    @Test
    fun `reads the pair end-to-end conversation when the gateway names it`() {
        val status = ConversationEncryptionStatusDecoder.decode(served(pair = "\"c42\""))

        assertThat(status?.pairEndToEndConversationId).isEqualTo("c42")
    }

    @Test
    fun `end to end is the e2ee mode whatever its case`() {
        val e2ee = ConversationEncryptionStatusDecoder.decode(served(mode = "\" E2EE \""))

        assertThat(e2ee?.isEndToEnd).isTrue()
        assertThat(ConversationEncryptionStatusDecoder.decode(served())?.isEndToEnd).isFalse()
    }
}
