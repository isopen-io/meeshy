package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.SerializationException
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ApiViolation
import okhttp3.Headers
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
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

    // --- HttpException: the gateway's own `code`/`error` from the error body must
    // win over the synthetic "HTTP_$status" — two endpoints can answer the SAME
    // status for different reasons (e.g. /me/account/deletion's 409 ALREADY_PENDING
    // vs. 409 NO_EMAIL), and only the body-carried code tells them apart. ---

    /**
     * Les corps de refus qualifiés, déclarés en constantes : coupés en deux
     * chaînes brutes, la seconde commencerait par un guillemet collé au `"""`
     * ouvrant — une forme que le lexeur n'a aucune raison de rendre lisible.
     */
    private val USERNAME_TAKEN_BODY: String =
        "{\"success\":false,\"code\":\"USERNAME_TAKEN\",\"field\":\"username\"," +
            "\"error\":\"Username taken\",\"suggestions\":[\"ada1\",\"ada2\"]}"

    private val VALIDATION_ERROR_BODY: String =
        "{\"success\":false,\"code\":\"VALIDATION_ERROR\",\"error\":\"Validation failed\"," +
            "\"violations\":[{\"path\":\"/body/email\",\"message\":\"invalid\"}]}"

    private fun httpExceptionWithBody(status: Int, body: String?): HttpException {
        val responseBody = body?.toResponseBody("application/json".toMediaTypeOrNull())
        val response = if (responseBody != null) {
            Response.error<Unit>(status, responseBody)
        } else {
            Response.error<Unit>(status, "".toResponseBody(null))
        }
        return HttpException(response)
    }

    @Test
    fun httpException_bodyCodeWinsOverTheSyntheticStatusCode() = runTest {
        val exception = httpExceptionWithBody(
            409,
            """{"success":false,"code":"NO_EMAIL","error":"Add an email before deleting."}""",
        )

        val result = apiCall<String> { throw exception }

        val failure = result as NetworkResult.Failure
        assertThat(failure.error.code).isEqualTo("NO_EMAIL")
        assertThat(failure.error.message).isEqualTo("Add an email before deleting.")
        assertThat(failure.error.httpStatus).isEqualTo(409)
    }

    @Test
    fun httpException_malformedBody_fallsBackToTheSyntheticStatusCode() = runTest {
        val exception = httpExceptionWithBody(500, "not json at all")

        val result = apiCall<String> { throw exception }

        val failure = result as NetworkResult.Failure
        assertThat(failure.error.code).isEqualTo("HTTP_500")
        assertThat(failure.error.httpStatus).isEqualTo(500)
    }

    @Test
    fun httpException_absentBody_fallsBackToTheSyntheticStatusCode() = runTest {
        val exception = httpExceptionWithBody(401, null)

        val result = apiCall<String> { throw exception }

        val failure = result as NetworkResult.Failure
        assertThat(failure.error.code).isEqualTo("HTTP_401")
        assertThat(failure.error.httpStatus).isEqualTo(401)
    }

    // --- Les trois cles qui QUALIFIENT un refus (`field`, `suggestions`,
    // `violations`) vivent a la RACINE de l'enveloppe, jamais sous `error`. Sans
    // elles, un ecran ne peut poser un refus que dans une banniere globale, et
    // l'utilisateur cherche seul lequel de ses champs est en cause. ---

    @Test
    fun httpException_carriesTheRefusalQualifyingKeysFromTheEnvelopeRoot() = runTest {
        val exception = httpExceptionWithBody(
            409,
            USERNAME_TAKEN_BODY,
        )

        val result = apiCall<String> { throw exception }

        val failure = result as NetworkResult.Failure
        assertThat(failure.error.code).isEqualTo("USERNAME_TAKEN")
        assertThat(failure.error.fieldName).isEqualTo("username")
        assertThat(failure.error.suggestions).containsExactly("ada1", "ada2").inOrder()
    }

    @Test
    fun httpException_carriesEveryValidationViolation() = runTest {
        val exception = httpExceptionWithBody(
            400,
            VALIDATION_ERROR_BODY,
        )

        val result = apiCall<String> { throw exception }

        val failure = result as NetworkResult.Failure
        assertThat(failure.error.violations)
            .containsExactly(ApiViolation(path = "/body/email", message = "invalid"))
    }

    @Test
    fun failure_envelopeWithoutQualifyingKeys_carriesNoneRatherThanNull() = runTest {
        val result = apiCall { ApiResponse<String>(success = false, error = "boom") }

        val failure = result as NetworkResult.Failure
        assertThat(failure.error.fieldName).isNull()
        assertThat(failure.error.suggestions).isEmpty()
        assertThat(failure.error.violations).isEmpty()
    }

    @Test
    fun pagedApiCall_httpException_bodyCodeWinsOverTheSyntheticStatusCode() = runTest {
        val exception = httpExceptionWithBody(
            409,
            """{"success":false,"code":"NO_EMAIL","error":"Add an email before deleting."}""",
        )

        val result = pagedApiCall<String> { throw exception }

        val failure = result as NetworkResult.Failure
        assertThat(failure.error.code).isEqualTo("NO_EMAIL")
    }

    @Test
    fun rawApiCall_httpException_bodyCodeWinsOverTheSyntheticStatusCode() = runTest {
        val exception = httpExceptionWithBody(
            409,
            """{"success":false,"code":"NO_EMAIL","error":"Add an email before deleting."}""",
        )

        val result = rawApiCall<String> { throw exception }

        val failure = result as NetworkResult.Failure
        assertThat(failure.error.code).isEqualTo("NO_EMAIL")
    }

    @Test
    fun map_transformsSuccessOnly() {
        assertThat(NetworkResult.Success(2).map { it * 3 }).isEqualTo(NetworkResult.Success(6))
        val failure = NetworkResult.Failure(ApiError("nope"))
        assertThat(failure.map { it }).isSameInstanceAs(failure)
    }

    // --- headerCall: raw retrofit2.Response calls that carry their result in a
    // response header rather than the JSON body (TUS session creation) ---

    @Test
    fun headerCall_successfulResponse_extractsTheNamedHeader() = runTest {
        val response = Response.success(Unit, Headers.headersOf("Location", "https://gate/api/v1/uploads/abc"))

        val result = headerCall("Location") { response }

        assertThat(result).isEqualTo(NetworkResult.Success("https://gate/api/v1/uploads/abc"))
    }

    @Test
    fun headerCall_successfulResponseMissingHeader_isFailure() = runTest {
        val result = headerCall("Location") { Response.success(Unit) }

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
    }

    @Test
    fun headerCall_httpErrorResponse_isFailureCarryingTheStatus() = runTest {
        val error = Response.error<Unit>(403, "denied".toResponseBody("text/plain".toMediaTypeOrNull()))

        val result = headerCall("Location") { error }

        val failure = result as NetworkResult.Failure
        assertThat(failure.error.httpStatus).isEqualTo(403)
    }

    @Test
    fun headerCall_ioException_isNetworkFailure() = runTest {
        val result = headerCall<Unit>("Location") { throw IOException("offline") }

        val failure = result as NetworkResult.Failure
        assertThat(failure.error.code).isEqualTo("NETWORK")
    }

    // --- chunkCall: raw retrofit2.Response<Unit> calls whose only signal is HTTP
    // success/failure (an intermediate TUS chunk PATCH — 204 No Content, no body,
    // no header payload the caller needs) ---

    @Test
    fun chunkCall_successfulResponse_isSuccess() = runTest {
        val result = chunkCall { Response.success(Unit) }

        assertThat(result).isEqualTo(NetworkResult.Success(Unit))
    }

    @Test
    fun chunkCall_httpErrorResponse_isFailureCarryingTheStatus() = runTest {
        val error = Response.error<Unit>(409, "offset mismatch".toResponseBody("text/plain".toMediaTypeOrNull()))

        val result = chunkCall { error }

        val failure = result as NetworkResult.Failure
        assertThat(failure.error.httpStatus).isEqualTo(409)
    }

    @Test
    fun chunkCall_ioException_isNetworkFailure() = runTest {
        val result = chunkCall { throw IOException("offline") }

        val failure = result as NetworkResult.Failure
        assertThat(failure.error.code).isEqualTo("NETWORK")
    }
}
