package me.meeshy.sdk.e2ee

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.E2eeDeviceApi
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

/** « Mes appareils chiffrés » (#13014) : lecture stricte, retrait idempotent, rien d'un compte ne survit au suivant. */
class OwnEncryptedDevicesRepositoryTest {

    private fun obj(text: String) = Json.parseToJsonElement(text) as JsonObject

    private fun device(deviceId: Int, current: Boolean = false, lastSeenAt: String = "2026-10-25T09:30:00Z") =
        """{"deviceId":$deviceId,"registrationId":${100 + deviceId},"platform":"ios","label":null,""" +
            """"enrolledAt":"2026-10-20T08:00:00Z","lastSeenAt":"$lastSeenAt","current":$current}"""

    private fun listed(vararg devices: String) = ApiResponse(true, obj("""{"devices":[${devices.joinToString(",")}]}"""))

    private fun http(code: Int, body: String) = HttpException(
        Response.error<Any>(code, body.toResponseBody("application/json".toMediaType())),
    )

    private class FakeApi(
        var list: suspend () -> ApiResponse<JsonObject> = { error("unused") },
        var retire: suspend (Int) -> ApiResponse<JsonObject> = { error("unused") },
    ) : E2eeDeviceApi {
        val retired = mutableListOf<Int>()
        override suspend fun ownDevices() = list()
        override suspend fun retireDevice(deviceId: Int): ApiResponse<JsonObject> {
            retired += deviceId
            return retire(deviceId)
        }
    }

    @Test
    fun `a refresh serves the devices in display order and remembers them`() = runTest {
        val repo = OwnEncryptedDevicesRepository(
            FakeApi(list = { listed(device(1, lastSeenAt = "2026-10-01T00:00:00Z"), device(2), device(3, current = true)) }),
        )

        val result = repo.refresh() as NetworkResult.Success

        assertThat(result.data.map { it.deviceId }).containsExactly(3, 2, 1).inOrder()
        assertThat(repo.devices.value!!.map { it.deviceId }).containsExactly(3, 2, 1).inOrder()
    }

    @Test
    fun `a malformed answer fails and never replaces the remembered list`() = runTest {
        val api = FakeApi(list = { listed(device(1)) })
        val repo = OwnEncryptedDevicesRepository(api)
        repo.refresh()

        api.list = { ApiResponse(true, obj("""{"devices":[{"deviceId":"1"}]}""")) }
        val failure = repo.refresh() as NetworkResult.Failure

        assertThat(failure.error.code).isEqualTo("MALFORMED_RESPONSE")
        assertThat(repo.devices.value!!.map { it.deviceId }).containsExactly(1)
    }

    @Test
    fun `offline keeps the remembered list and says why`() = runTest {
        val api = FakeApi(list = { listed(device(1)) })
        val repo = OwnEncryptedDevicesRepository(api)
        repo.refresh()

        api.list = { throw IOException("no route to host") }
        val failure = repo.refresh() as NetworkResult.Failure

        assertThat(failure.error.code).isEqualTo("NETWORK")
        assertThat(repo.devices.value).hasSize(1)
    }

    @Test
    fun `retiring removes the device only once the gateway confirms it`() = runTest {
        val api = FakeApi(list = { listed(device(1), device(2)) }, retire = { ApiResponse(true, obj("""{"deviceId":$it,"retired":true}""")) })
        val repo = OwnEncryptedDevicesRepository(api)
        repo.refresh()

        val result = repo.retire(2)

        assertThat(result).isEqualTo(NetworkResult.Success(Unit))
        assertThat(api.retired).containsExactly(2)
        assertThat(repo.devices.value!!.map { it.deviceId }).containsExactly(1)
    }

    @Test
    fun `a device the gateway no longer knows counts as retired`() = runTest {
        val api = FakeApi(
            list = { listed(device(1), device(2)) },
            retire = { throw http(404, """{"success":false,"error":"introuvable","code":"E2EE_DEVICE_NOT_BOUND"}""") },
        )
        val repo = OwnEncryptedDevicesRepository(api)
        repo.refresh()

        assertThat(repo.retire(2)).isEqualTo(NetworkResult.Success(Unit))
        assertThat(repo.devices.value!!.map { it.deviceId }).containsExactly(1)
    }

    @Test
    fun `a refused or unconfirmed retirement keeps the device listed`() = runTest {
        val api = FakeApi(list = { listed(device(1), device(2)) })
        val repo = OwnEncryptedDevicesRepository(api)
        repo.refresh()

        api.retire = { throw http(500, """{"success":false,"error":"boom"}""") }
        val refused = repo.retire(2)
        api.retire = { ApiResponse(true, obj("""{"deviceId":1,"retired":true}""")) }
        val otherDevice = repo.retire(2)
        api.retire = { throw http(404, """{"success":false,"error":"route"}""") }
        val bare404 = repo.retire(2)

        assertThat(refused).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(otherDevice).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(bare404).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(repo.devices.value!!.map { it.deviceId }).containsExactly(1, 2).inOrder()
    }

    @Test
    fun `signing out forgets the list, and a read started before never writes it back`() = runTest {
        val gate = CompletableDeferred<ApiResponse<JsonObject>>()
        val api = FakeApi(list = { listed(device(1)) })
        val repo = OwnEncryptedDevicesRepository(api)
        repo.refresh()

        api.list = { gate.await() }
        val inFlight = async { repo.refresh() }
        testScheduler.runCurrent()
        repo.clear()
        gate.complete(listed(device(9)))
        inFlight.await()

        assertThat(repo.devices.value).isNull()
    }
}
