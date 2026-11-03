package me.meeshy.sdk.e2ee.libsignal

import javax.inject.Inject
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import me.meeshy.core.e2ee.device.E2eeDirectoryClient
import me.meeshy.core.e2ee.wire.E2eeAckRequest
import me.meeshy.core.e2ee.wire.E2eeAckResult
import me.meeshy.core.e2ee.wire.E2eeEnrollDeviceRequest
import me.meeshy.core.e2ee.wire.E2eeEnrollment
import me.meeshy.core.e2ee.wire.E2eeEnvelopePage
import me.meeshy.core.e2ee.wire.E2eeJson
import me.meeshy.core.e2ee.wire.E2eePreKeyStock
import me.meeshy.core.e2ee.wire.E2eePublishKeysRequest
import me.meeshy.core.e2ee.wire.E2eeRemoteException
import me.meeshy.core.e2ee.wire.E2eeRetirement
import me.meeshy.core.e2ee.wire.E2eeUserBundles
import me.meeshy.core.e2ee.wire.E2eeUserDevices
import me.meeshy.core.e2ee.wire.LibsignalSendRequest
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.net.MeeshyApi
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.ResponseBody
import retrofit2.Response

/** Le client de l'annuaire et du relais sur le client authentifié partagé (jeton, rafraîchissement, épinglage SPKI). */
internal class RetrofitE2eeDirectoryClient @Inject constructor(api: MeeshyApi) : E2eeDirectoryClient {
    private val routes: E2eeRelayRoutes = api.service(E2eeRelayRoutes::class.java)

    override suspend fun enroll(request: E2eeEnrollDeviceRequest): E2eeEnrollment =
        data(routes.enroll(body(E2eeEnrollDeviceRequest.serializer(), request)), E2eeEnrollment.serializer())

    override suspend fun publishKeys(deviceId: Int, request: E2eePublishKeysRequest): E2eePreKeyStock =
        data(routes.publishKeys(deviceId, body(E2eePublishKeysRequest.serializer(), request)), E2eePreKeyStock.serializer())

    override suspend fun preKeyStock(): E2eePreKeyStock = data(routes.preKeyStock(), E2eePreKeyStock.serializer())

    override suspend fun retireDevice(deviceId: Int, registrationId: Int): E2eeRetirement =
        data(routes.retireDevice(deviceId, registrationId), E2eeRetirement.serializer())

    override suspend fun bundles(userId: String, deviceIds: List<Int>?): E2eeUserBundles =
        data(routes.bundles(userId, deviceIds?.joinToString(",")), E2eeUserBundles.serializer())

    override suspend fun devices(userId: String): E2eeUserDevices = data(routes.devices(userId), E2eeUserDevices.serializer())

    override suspend fun envelopes(after: String?, limit: Int?): E2eeEnvelopePage =
        data(routes.envelopes(after, limit), E2eeEnvelopePage.serializer())

    override suspend fun acknowledge(envelopeIds: List<String>): E2eeAckResult =
        data(routes.acknowledge(body(E2eeAckRequest.serializer(), E2eeAckRequest(envelopeIds))), E2eeAckResult.serializer())

    /** L'envoi libsignal : le message servi (son `content` est le littéral `[Encrypted]`), ou le refus avec son code. */
    suspend fun send(conversationId: String, request: LibsignalSendRequest): ApiMessage {
        val response = routes.sendLibsignal(conversationId, body(LibsignalSendRequest.serializer(), request))
        val raw = successBody(response)
        val data = E2eeJson.parseToJsonElement(raw).jsonObject["data"] ?: throw E2eeRemoteException("MISSING_DATA", response.code())
        return MeeshyApi.json.decodeFromJsonElement(ApiMessage.serializer(), data)
    }

    private fun <T> body(serializer: KSerializer<T>, value: T): RequestBody =
        E2eeJson.encodeToString(serializer, value).toRequestBody(JSON)

    private fun <T> data(response: Response<ResponseBody>, serializer: KSerializer<T>): T {
        val raw = successBody(response)
        val envelope = E2eeJson.parseToJsonElement(raw) as? JsonObject ?: throw E2eeRemoteException("MALFORMED_RESPONSE", response.code())
        val data = envelope["data"] ?: throw E2eeRemoteException("MISSING_DATA", response.code())
        return E2eeJson.decodeFromJsonElement(serializer, data)
    }

    private fun successBody(response: Response<ResponseBody>): String {
        if (!response.isSuccessful) throw E2eeRemoteException.fromResponse(response.code(), response.errorBody()?.use { it.string() })
        return response.body()?.use { it.string() } ?: throw E2eeRemoteException("EMPTY_RESPONSE", response.code())
    }

    private companion object {
        val JSON = "application/json; charset=utf-8".toMediaType()
    }
}
