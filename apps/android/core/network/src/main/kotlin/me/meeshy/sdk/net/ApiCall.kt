package me.meeshy.sdk.net

import me.meeshy.sdk.model.ApiResponse
import retrofit2.HttpException
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
    }
