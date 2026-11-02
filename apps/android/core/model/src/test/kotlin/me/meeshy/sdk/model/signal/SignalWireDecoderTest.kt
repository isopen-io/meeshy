package me.meeshy.sdk.model.signal

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Test

class SignalWireDecoderTest {
    private fun obj(text: String) = Json.parseToJsonElement(text) as JsonObject

    private val bundle = """{"identityKey":"ik","registrationId":1,"deviceId":1,"preKeyId":null,
        "signedPreKeyId":2,"signedPreKeyPublic":"spk","signedPreKeySignature":"sig"}"""

    @Test
    fun `un bundle conforme se decode`() {
        val decoded = SignalWireDecoder.bundle(obj(bundle))
        assertThat(decoded?.signedPreKeyId).isEqualTo(2)
        assertThat(decoded?.preKeyId).isNull()
    }

    @Test
    fun `un identifiant numerique entre guillemets echoue au lieu d'etre coerce`() {
        assertThat(SignalWireDecoder.bundle(obj(bundle.replace("\"signedPreKeyId\":2", "\"signedPreKeyId\":\"2\"")))).isNull()
    }

    @Test
    fun `une cle requise absente ou nulle echoue`() {
        assertThat(SignalWireDecoder.bundle(obj(bundle.replace("\"identityKey\":\"ik\",", "")))).isNull()
        assertThat(SignalWireDecoder.bundle(obj(bundle.replace("\"ik\"", "null")))).isNull()
    }

    @Test
    fun `une cle en nombre ou un identifiant fractionnaire echoue`() {
        assertThat(SignalWireDecoder.bundle(obj(bundle.replace("\"ik\"", "5")))).isNull()
        assertThat(SignalWireDecoder.bundle(obj(bundle.replace("\"deviceId\":1", "\"deviceId\":1.5")))).isNull()
    }

    @Test
    fun `un champ optionnel du mauvais type echoue`() {
        assertThat(SignalWireDecoder.bundle(obj(bundle.replace("\"preKeyId\":null", "\"preKeyId\":true")))).isNull()
    }

    @Test
    fun `une cle inconnue est toleree`() {
        assertThat(SignalWireDecoder.bundle(obj(bundle.replace("{", "{\"futur\":1,")))).isNotNull()
    }

    @Test
    fun `le resultat de publication est un objet strict`() {
        val ok = SignalWireDecoder.uploadResult(obj("""{"registrationId":1,"deviceId":1,"preKeyId":3,"signedPreKeyId":2,"message":"ok"}"""))
        assertThat(ok?.message).isEqualTo("ok")
        assertThat(SignalWireDecoder.uploadResult(obj("""{"registrationId":"1"}"""))).isNull()
        assertThat(SignalWireDecoder.uploadResult(obj("""{"message":7}"""))).isNull()
    }

    @Test
    fun `le resultat d'etablissement est un objet strict`() {
        assertThat(SignalWireDecoder.establishResult(obj("""{"message":"ok"}"""))?.message).isEqualTo("ok")
        assertThat(SignalWireDecoder.establishResult(obj("""{"message":false}"""))).isNull()
    }
}
