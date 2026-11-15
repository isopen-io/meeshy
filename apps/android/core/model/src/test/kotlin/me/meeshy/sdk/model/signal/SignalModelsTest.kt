package me.meeshy.sdk.model.signal

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/** Les charges des routes Signal : la forme de `signalPreKeyBundleSchema`, et rien de secret dans un journal. */
class SignalModelsTest {

    private val wire = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private val servedBundle = """
        {"identityKey":"SECRET-IDENTITY-KEY","registrationId":1234,"deviceId":1,
         "preKeyId":null,"preKeyPublic":null,"signedPreKeyId":7,
         "signedPreKeyPublic":"SIGNED-PUBLIC","signedPreKeySignature":"SIGNATURE",
         "kyberPreKeyId":null,"kyberPreKeyPublic":null,"kyberPreKeySignature":null}
    """.trimIndent()

    @Test
    fun `a served bundle decodes with its nullable one-time and kyber keys absent`() {
        val bundle = wire.decodeFromString(SignalPreKeyBundle.serializer(), servedBundle)

        assertThat(bundle.registrationId).isEqualTo(1234)
        assertThat(bundle.signedPreKeyId).isEqualTo(7)
        assertThat(bundle.preKeyId).isNull()
        assertThat(bundle.kyberPreKeyPublic).isNull()
    }

    @Test
    fun `an uploaded bundle omits the keys it does not have`() {
        val bundle = SignalPreKeyBundle(
            identityKey = "ik",
            registrationId = 1,
            deviceId = 1,
            signedPreKeyId = 2,
            signedPreKeyPublic = "spk",
            signedPreKeySignature = "sig",
        )

        val body = wire.encodeToString(SignalPreKeyBundle.serializer(), bundle)

        val expected = listOf(
            "\"identityKey\":\"ik\"",
            "\"registrationId\":1",
            "\"deviceId\":1",
            "\"signedPreKeyId\":2",
            "\"signedPreKeyPublic\":\"spk\"",
            "\"signedPreKeySignature\":\"sig\"",
        ).joinToString(separator = ",", prefix = "{", postfix = "}")
        assertThat(body).isEqualTo(expected)
    }

    @Test
    fun `a bundle never prints its keys`() {
        val bundle = wire.decodeFromString(SignalPreKeyBundle.serializer(), servedBundle)

        assertThat(bundle.toString()).doesNotContain("SECRET-IDENTITY-KEY")
        assertThat(bundle.toString()).doesNotContain("SIGNED-PUBLIC")
        assertThat(bundle.toString()).doesNotContain("SIGNATURE")
    }

    @Test
    fun `establishing a session names the recipient and the conversation`() {
        val body = wire.encodeToString(
            EstablishSessionRequest.serializer(),
            EstablishSessionRequest(recipientUserId = "u2", conversationId = "c1"),
        )

        assertThat(body).isEqualTo("""{"recipientUserId":"u2","conversationId":"c1"}""")
    }

    @Test
    fun `the upload and establish results tolerate a bare message`() {
        assertThat(
            wire.decodeFromString(EstablishSessionResult.serializer(), """{"message":"ok"}""").message,
        ).isEqualTo("ok")
        assertThat(
            wire.decodeFromString(SignalPreKeyUploadResult.serializer(), "{}"),
        ).isEqualTo(SignalPreKeyUploadResult())
    }
}
