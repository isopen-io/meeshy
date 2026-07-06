package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.SerializationException
import me.meeshy.sdk.model.ApiResponse
import org.junit.Test
import java.io.IOException

class ApiCallTest {

    @Test
    fun success_envelope_unwrapsData() = runTest {
        val result = apiCall { ApiResponse(success = true, data = "hello") }
        assertThat(result).isEqualTo(NetworkResult.Success("hello"))
    }

    @Test
    fun failure_envelope_mapsErrorMessage() = runTest {
        val result = apiCall { ApiResponse<String>(success = false, error = "boom") }
        val failure = result as NetworkResult.Failure
        assertThat(failure.error.message).isEqualTo("boom")
    }

    @Test
    fun success_withNullData_isFailure() = runTest {
        val result = apiCall { ApiResponse<String>(success = true, data = null) }
        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
    }

    @Test
    fun ioException_isNetworkFailure() = runTest {
        val result = apiCall<String> { throw IOException("offline") }
        val failure = result as NetworkResult.Failure
        assertThat(failure.error.code).isEqualTo("NETWORK")
    }

    @Test
    fun serializationException_isParseFailure() = runTest {
        // A malformed/unexpected response body (e.g. auth `/me` missing required
        // MeeshyUser fields) must degrade to a Failure, never crash the caller.
        val result = apiCall<String> {
            throw SerializationException("Fields [id, username] are required for MeeshyUser")
        }
        val failure = result as NetworkResult.Failure
        assertThat(failure.error.code).isEqualTo("PARSE")
    }

    @Test
    fun rawApiCall_serializationException_isParseFailure() = runTest {
        val result = rawApiCall<String> { throw SerializationException("bad json") }
        val failure = result as NetworkResult.Failure
        assertThat(failure.error.code).isEqualTo("PARSE")
    }

    @Test
    fun map_transformsSuccessOnly() {
        assertThat(NetworkResult.Success(2).map { it * 3 }).isEqualTo(NetworkResult.Success(6))
        val failure = NetworkResult.Failure(ApiError("nope"))
        assertThat(failure.map { it }).isSameInstanceAs(failure)
    }
}
