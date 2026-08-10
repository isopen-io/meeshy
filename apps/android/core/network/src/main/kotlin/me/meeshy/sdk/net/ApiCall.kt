package me.meeshy.sdk.net

import kotlinx.serialization.SerializationException
import me.meeshy.sdk.model.ApiResponse
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

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
        NetworkResult.Failure(
            ApiError(message = e.message(), code = "HTTP_${e.code()}", httpStatus = e.code()),
        )
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
 * Run an API call whose response does NOT use the standard [ApiResponse] envelope
 * (e.g. `{ success, count }`). [block] extracts the value directly; transport/HTTP
 * exceptions are folded into [NetworkResult.Failure].
 */
suspend fun <T> rawApiCall(block: suspend () -> T): NetworkResult<T> =
    try {
        NetworkResult.Success(block())
    } catch (e: HttpException) {
        NetworkResult.Failure(
            ApiError(message = e.message(), code = "HTTP_${e.code()}", httpStatus = e.code()),
        )
    } catch (e: IOException) {
        NetworkResult.Failure(
            ApiError(message = e.message ?: "Network unavailable", code = "NETWORK"),
        )
    } catch (e: SerializationException) {
        NetworkResult.Failure(
            ApiError(message = e.message ?: "Malformed response", code = "PARSE"),
        )
    }
