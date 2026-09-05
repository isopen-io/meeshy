package me.meeshy.sdk.net

import kotlinx.serialization.SerializationException
import kotlinx.serialization.decodeFromString
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

/** [apiCall]'s payload plus the envelope's `pagination` block, which [apiCall] discards. */
data class PagedResult<T>(val data: T, val pagination: Pagination?)

/**
 * Turns a Retrofit [HttpException] into an [ApiError] carrying the GATEWAY'S OWN
 * `code`/`error` when its body decodes as an [ApiResponse] envelope, instead of only
 * the synthetic `"HTTP_$status"` — otherwise two endpoints answering the same status
 * for different reasons (e.g. `/me/account/deletion`'s `409 ALREADY_PENDING` vs.
 * `409 NO_EMAIL`) are indistinguishable to every caller that discriminates on
 * [ApiError.code]. Best-effort: an absent/malformed body falls back to the prior
 * synthetic shape unchanged, so a caller that only ever checked [ApiError.httpStatus]
 * sees no behavioural change.
 */
private fun apiErrorFromHttpException(e: HttpException): ApiError {
    val body = runCatching { e.response()?.errorBody()?.string() }.getOrNull()
    val envelope = body?.let { runCatching { MeeshyApi.json.decodeFromString<ApiResponse<Unit>>(it) }.getOrNull() }
    return ApiError(
        message = envelope?.error ?: envelope?.message ?: e.message(),
        code = envelope?.code ?: "HTTP_${e.code()}",
        httpStatus = e.code(),
    )
}

/**
 * Run an API call returning the standard [ApiResponse] envelope and fold it into a
 * [NetworkResult], translating transport/HTTP exceptions into [ApiError].
 */
suspend fun <T> apiCall(block: suspend () -> ApiResponse<T>): NetworkResult<T> =
    try {
        val response = block()
        val data = response.data
        if (response.success && data != null) {
            NetworkResult.Success(data)
        } else {
            NetworkResult.Failure(
                ApiError(
                    message = response.error ?: response.message ?: "Unknown error",
                    code = response.code,
                ),
            )
        }
    } catch (e: HttpException) {
        NetworkResult.Failure(apiErrorFromHttpException(e))
    } catch (e: IOException) {
        NetworkResult.Failure(
            ApiError(message = e.message ?: "Network unavailable", code = "NETWORK"),
        )
    } catch (e: SerializationException) {
        NetworkResult.Failure(
            ApiError(message = e.message ?: "Malformed response", code = "PARSE"),
        )
    }

/**
 * Variante de [apiCall] qui préserve `pagination` au lieu de la jeter — pour tout
 * appelant qui doit savoir s'il reste des pages (`hasMore`/`nextCursor`) plutôt que
 * de traiter chaque réponse comme un instantané complet.
 */
suspend fun <T> pagedApiCall(block: suspend () -> ApiResponse<T>): NetworkResult<PagedResult<T>> =
    try {
        val response = block()
        val data = response.data
        if (response.success && data != null) {
            NetworkResult.Success(PagedResult(data, response.pagination))
        } else {
            NetworkResult.Failure(
                ApiError(
                    message = response.error ?: response.message ?: "Unknown error",
                    code = response.code,
                ),
            )
        }
    } catch (e: HttpException) {
        NetworkResult.Failure(apiErrorFromHttpException(e))
    } catch (e: IOException) {
        NetworkResult.Failure(
            ApiError(message = e.message ?: "Network unavailable", code = "NETWORK"),
        )
    } catch (e: SerializationException) {
        NetworkResult.Failure(
            ApiError(message = e.message ?: "Malformed response", code = "PARSE"),
        )
    }

/**
 * Variante pour les enveloppes SANS champ `data` (`{"success":true}`) — p.ex. les
 * endpoints anti-enumeration (forgot-password) qui ne renvoient jamais de corps.
 * [apiCall] exige `data != null`, ce qui transformait ces succes en
 * "Unknown error" ; ici le succes de l'enveloppe suffit.
 */
suspend fun apiCallUnit(block: suspend () -> ApiResponse<Unit>): NetworkResult<Unit> =
    apiCall {
        val response = block()
        if (response.success && response.data == null) response.copy(data = Unit) else response
    }

/**
 * Run a raw `retrofit2.Response` call whose result rides in a response **header**
 * rather than the JSON body (e.g. a TUS session `POST` returning its session URL as
 * a `Location` header on `201 Created`, with no body — [ApiResponse]/[apiCall]
 * cannot express this shape). A non-2xx response or a missing [headerName] both fold
 * to [NetworkResult.Failure], the latter carrying no HTTP status (the request itself
 * succeeded; the server just didn't include the header the caller needed).
 */
suspend fun <T> headerCall(headerName: String, block: suspend () -> Response<T>): NetworkResult<String> =
    try {
        val response = block()
        if (!response.isSuccessful) {
            NetworkResult.Failure(
                ApiError(message = "Request failed", code = "HTTP_${response.code()}", httpStatus = response.code()),
            )
        } else {
            val value = response.headers()[headerName]
            if (value != null) {
                NetworkResult.Success(value)
            } else {
                NetworkResult.Failure(ApiError(message = "Missing $headerName header", code = "MISSING_HEADER"))
            }
        }
    } catch (e: HttpException) {
        NetworkResult.Failure(
            ApiError(message = e.message(), code = "HTTP_${e.code()}", httpStatus = e.code()),
        )
    } catch (e: IOException) {
        NetworkResult.Failure(
            ApiError(message = e.message ?: "Network unavailable", code = "NETWORK"),
        )
    }

/**
 * Run a raw `retrofit2.Response<Unit>` call whose only signal is HTTP success/
 * failure — no body to decode, no header the caller needs (unlike [headerCall]). An
 * intermediate TUS chunk PATCH (204 No Content per the tus.io protocol) is the first
 * user: every chunk but the last only needs to know whether the PATCH landed.
 */
suspend fun chunkCall(block: suspend () -> Response<Unit>): NetworkResult<Unit> =
    try {
        val response = block()
        if (response.isSuccessful) {
            NetworkResult.Success(Unit)
        } else {
            NetworkResult.Failure(
                ApiError(message = "Request failed", code = "HTTP_${response.code()}", httpStatus = response.code()),
            )
        }
    } catch (e: HttpException) {
        NetworkResult.Failure(
            ApiError(message = e.message(), code = "HTTP_${e.code()}", httpStatus = e.code()),
        )
    } catch (e: IOException) {
        NetworkResult.Failure(
            ApiError(message = e.message ?: "Network unavailable", code = "NETWORK"),
        )
    }

/**
 * Run an API call whose response does NOT use the standard [ApiResponse] envelope
 * (e.g. `{ success, count }`). [block] extracts the value directly; transport/HTTP
 * exceptions are folded into [NetworkResult.Failure].
 */
suspend fun <T> rawApiCall(block: suspend () -> T): NetworkResult<T> =
    try {
        NetworkResult.Success(block())
    } catch (e: HttpException) {
        NetworkResult.Failure(apiErrorFromHttpException(e))
    } catch (e: IOException) {
        NetworkResult.Failure(
            ApiError(message = e.message ?: "Network unavailable", code = "NETWORK"),
        )
    } catch (e: SerializationException) {
        NetworkResult.Failure(
            ApiError(message = e.message ?: "Malformed response", code = "PARSE"),
        )
    }

/**
 * Outcome of [conditionalApiCall] — a THIRD state beyond [NetworkResult]'s
 * Success/Failure, because "304 Not Modified" is neither: RFC 7232 says a 304
 * carries no body (there is nothing to decode), and it is not a failure — it is
 * the server CONFIRMING the validator the caller sent (`If-None-Match`) is still
 * current. #5188.
 */
sealed interface ConditionalResult<out T> {
    /** A decoded 2xx body, plus the response's own `ETag` header (if any) to remember for next time. */
    data class Fresh<T>(val data: T, val pagination: Pagination?, val etag: String?) : ConditionalResult<T>

    /** 304 — the caller's held validator still matches; there is no body to read. */
    data object NotModified : ConditionalResult<Nothing>

    data class Failure(val error: ApiError) : ConditionalResult<Nothing>
}

/**
 * Same decode as [apiErrorFromHttpException], for a Retrofit [Response] that was
 * never thrown as an [HttpException] in the first place — [conditionalApiCall]'s
 * Retrofit method returns the raw `Response` (like [headerCall]/[chunkCall]), which
 * does not throw on a non-2xx status.
 */
private fun apiErrorFromResponse(response: Response<*>): ApiError {
    val body = runCatching { response.errorBody()?.string() }.getOrNull()
    val envelope = body?.let { runCatching { MeeshyApi.json.decodeFromString<ApiResponse<Unit>>(it) }.getOrNull() }
    return ApiError(
        message = envelope?.error ?: envelope?.message ?: "HTTP ${response.code()}",
        code = envelope?.code ?: "HTTP_${response.code()}",
        httpStatus = response.code(),
    )
}

/**
 * Runs a conditional GET (`If-None-Match`) whose Retrofit method returns the raw
 * [Response] rather than an unwrapped [ApiResponse] — required to reach the `ETag`
 * response HEADER (unreachable from the direct-return convention [apiCall]/
 * [pagedApiCall] use) and to tell a genuine 304 (no body) apart from a decoded 200,
 * since Retrofit's direct-return convention would otherwise fold BOTH into the same
 * generic [HttpException]. #5188 — the caller decides what to send as
 * `If-None-Match`; this only interprets what came back.
 */
suspend fun <T> conditionalApiCall(block: suspend () -> Response<ApiResponse<T>>): ConditionalResult<T> =
    try {
        val response = block()
        when {
            response.code() == 304 -> ConditionalResult.NotModified
            response.isSuccessful -> {
                val envelope = response.body()
                val data = envelope?.data
                if (envelope?.success == true && data != null) {
                    ConditionalResult.Fresh(data, envelope.pagination, response.headers()["ETag"])
                } else {
                    ConditionalResult.Failure(
                        ApiError(
                            message = envelope?.error ?: envelope?.message ?: "Unknown error",
                            code = envelope?.code,
                        ),
                    )
                }
            }
            else -> ConditionalResult.Failure(apiErrorFromResponse(response))
        }
    } catch (e: HttpException) {
        ConditionalResult.Failure(apiErrorFromHttpException(e))
    } catch (e: IOException) {
        ConditionalResult.Failure(ApiError(message = e.message ?: "Network unavailable", code = "NETWORK"))
    } catch (e: SerializationException) {
        ConditionalResult.Failure(ApiError(message = e.message ?: "Malformed response", code = "PARSE"))
    }
