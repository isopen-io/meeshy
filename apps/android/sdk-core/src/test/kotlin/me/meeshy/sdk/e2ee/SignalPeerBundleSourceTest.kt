package me.meeshy.sdk.e2ee

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import me.meeshy.core.crypto.primitives.CanonicalBase64
import me.meeshy.core.crypto.session.PeerBundleLookup
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.signal.EstablishSessionRequest
import me.meeshy.sdk.model.signal.SignalPreKeyBundle
import me.meeshy.sdk.net.api.SignalApi
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class SignalPeerBundleSourceTest {
    private fun b64(size: Int, fill: Int) = CanonicalBase64.encode(ByteArray(size) { fill.toByte() })

    private fun obj(text: String) = Json.parseToJsonElement(text) as JsonObject

    private fun http(code: Int) = HttpException(
        Response.error<Any>(code, """{"success":false,"error":"x"}""".toResponseBody("application/json".toMediaType())),
    )

    private fun bundleJson(identity: String = b64(32, 1), signed: String = b64(32, 2)) =
        """{"identityKey":"$identity","registrationId":1,"deviceId":1,"signedPreKeyId":2,
            "signedPreKeyPublic":"$signed","signedPreKeySignature":"${b64(64, 3)}"}"""

    private fun source(
        read: () -> ApiResponse<JsonObject> = { error("unused") },
        establish: () -> ApiResponse<JsonObject> = { error("unused") },
    ) = SignalPeerBundleSource(
        SignalRepository(
            object : SignalApi {
                override suspend fun uploadKeys(bundle: SignalPreKeyBundle) = error("unused")
                override suspend fun keysFor(userId: String) = error("unused")
                override suspend fun establishSession(body: EstablishSessionRequest) = error("unused")
                override suspend fun uploadKeysObject(bundle: SignalPreKeyBundle) = error("unused")
                override suspend fun keysForObject(userId: String) = read()
                override suspend fun establishSessionObject(body: EstablishSessionRequest) = establish()
            },
        ),
    )

    @Test
    fun `le DTO du bundle devient les deux cles publiques du pair`() = runTest {
        val lookup = source(read = { ApiResponse(true, obj(bundleJson())) }).fetchBundle("p1")

        val bundle = (lookup as PeerBundleLookup.Found).bundle
        assertThat(bundle.identityKey).isEqualTo(ByteArray(32) { 1 })
        assertThat(bundle.signedPreKeyPublic).isEqualTo(ByteArray(32) { 2 })
    }

    @Test
    fun `404 devient aucun bundle publie`() = runTest {
        val lookup = source(read = { throw http(404) }).fetchBundle("p1")

        assertThat(lookup).isEqualTo(PeerBundleLookup.NotPublished)
    }

    @Test
    fun `503 ou 403 deviennent indisponible`() = runTest {
        assertThat(source(read = { throw http(503) }).fetchBundle("p1")).isEqualTo(PeerBundleLookup.Unavailable)
        assertThat(source(read = { throw http(403) }).fetchBundle("p1")).isEqualTo(PeerBundleLookup.Unavailable)
    }

    @Test
    fun `une reponse malformee n'est jamais un bundle`() = runTest {
        val lookup = source(read = { ApiResponse(true, obj("""{"identityKey":1}""")) }).fetchBundle("p1")

        assertThat(lookup).isEqualTo(PeerBundleLookup.Malformed)
    }

    @Test
    fun `la notification de session reussit ou echoue selon la passerelle`() = runTest {
        assertThat(source(establish = { ApiResponse(true, obj("""{"message":"ok"}""")) }).announceSession("p1", "c1")).isTrue()
        assertThat(source(establish = { throw http(429) }).announceSession("p1", "c1")).isFalse()
    }
}
