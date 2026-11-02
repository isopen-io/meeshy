package me.meeshy.sdk.e2ee

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import me.meeshy.core.crypto.primitives.CanonicalBase64
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.signal.EstablishSessionRequest
import me.meeshy.sdk.model.signal.SignalPreKeyBundle
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.SignalApi
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class SignalRepositoryTest {
    private fun b64(size: Int) = CanonicalBase64.encode(ByteArray(size) { 7 })

    private fun obj(text: String) = Json.parseToJsonElement(text) as JsonObject

    private val bundle = SignalPreKeyBundle(
        identityKey = b64(32), registrationId = 1, deviceId = 1, signedPreKeyId = 2,
        signedPreKeyPublic = b64(32), signedPreKeySignature = b64(64),
    )

    private fun bundleJson(identity: String = b64(32)) =
        """{"identityKey":"$identity","registrationId":1,"deviceId":1,"signedPreKeyId":2,
            "signedPreKeyPublic":"${b64(32)}","signedPreKeySignature":"${b64(64)}"}"""

    private fun http(code: Int) = HttpException(
        Response.error<Any>(code, """{"success":false,"error":"x"}""".toResponseBody("application/json".toMediaType())),
    )

    private fun api(
        upload: () -> ApiResponse<JsonObject> = { error("unused") },
        read: () -> ApiResponse<JsonObject> = { error("unused") },
        establish: () -> ApiResponse<JsonObject> = { error("unused") },
    ) = object : SignalApi {
        override suspend fun uploadKeys(bundle: SignalPreKeyBundle) = error("typed route unused")
        override suspend fun keysFor(userId: String) = error("typed route unused")
        override suspend fun establishSession(body: EstablishSessionRequest) = error("typed route unused")
        override suspend fun uploadKeysObject(bundle: SignalPreKeyBundle) = upload()
        override suspend fun keysForObject(userId: String) = read()
        override suspend fun establishSessionObject(body: EstablishSessionRequest) = establish()
    }

    @Test
    fun `la data d'une publication est decodee comme objet`() = runTest {
        val repo = SignalRepository(api(upload = { ApiResponse(true, obj("""{"registrationId":1,"message":"ok"}""")) }))
        val result = repo.uploadBundle(bundle)
        assertThat((result as NetworkResult.Success).data.message).isEqualTo("ok")
    }

    @Test
    fun `un identifiant coerce echoue au lieu d'etre accepte`() = runTest {
        val repo = SignalRepository(api(upload = { ApiResponse(true, obj("""{"registrationId":"1"}""")) }))
        val failure = repo.uploadBundle(bundle) as NetworkResult.Failure
        assertThat(failure.error.code).isEqualTo("MALFORMED_RESPONSE")
    }

    @Test
    fun `un 404 et un 403 sont des echecs portant leur statut`() = runTest {
        val notFound = SignalRepository(api(read = { throw http(404) })).fetchBundle("u") as NetworkResult.Failure
        val forbidden = SignalRepository(api(read = { throw http(403) })).fetchBundle("u") as NetworkResult.Failure
        assertThat(notFound.error.httpStatus).isEqualTo(404)
        assertThat(forbidden.error.httpStatus).isEqualTo(403)
    }

    @Test
    fun `un 500 est un echec`() = runTest {
        val failure = SignalRepository(api(upload = { throw http(500) })).uploadBundle(bundle) as NetworkResult.Failure
        assertThat(failure.error.httpStatus).isEqualTo(500)
    }

    @Test
    fun `un bundle lu est valide`() = runTest {
        val repo = SignalRepository(api(read = { ApiResponse(true, obj(bundleJson())) }))
        assertThat((repo.fetchBundle("u") as NetworkResult.Success).data.signedPreKeyId).isEqualTo(2)
    }

    @Test
    fun `une cle de mauvaise longueur ou non canonique est refusee`() = runTest {
        val short = SignalRepository(api(read = { ApiResponse(true, obj(bundleJson(identity = b64(31)))) }))
        val garbage = SignalRepository(api(read = { ApiResponse(true, obj(bundleJson(identity = "pas base64"))) }))
        assertThat((short.fetchBundle("u") as NetworkResult.Failure).error.code).isEqualTo("MALFORMED_RESPONSE")
        assertThat((garbage.fetchBundle("u") as NetworkResult.Failure).error.code).isEqualTo("MALFORMED_RESPONSE")
    }

    @Test
    fun `l'etablissement de session est decode strictement`() = runTest {
        val ok = SignalRepository(api(establish = { ApiResponse(true, obj("""{"message":"ok"}""")) }))
        val bad = SignalRepository(api(establish = { ApiResponse(true, obj("""{"message":1}""")) }))
        val request = EstablishSessionRequest("u2", "c1")
        assertThat((ok.establishSession(request) as NetworkResult.Success).data.message).isEqualTo("ok")
        assertThat(bad.establishSession(request)).isInstanceOf(NetworkResult.Failure::class.java)
    }
}
