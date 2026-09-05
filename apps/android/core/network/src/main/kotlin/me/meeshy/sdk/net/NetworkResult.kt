package me.meeshy.sdk.net

import me.meeshy.sdk.model.ApiViolation

/** Outcome of a network call — explicit success/failure, no exceptions leaking to callers. */
sealed interface NetworkResult<out T> {
    data class Success<T>(val data: T) : NetworkResult<T>
    data class Failure(val error: ApiError) : NetworkResult<Nothing>

    val isSuccess: Boolean get() = this is Success

    fun getOrNull(): T? = (this as? Success)?.data

    fun <R> map(transform: (T) -> R): NetworkResult<R> = when (this) {
        is Success -> Success(transform(data))
        is Failure -> this
    }
}

/**
 * A refused call, with everything the gateway said about WHY.
 *
 * [code] discriminates the reason, [httpStatus] the transport verdict — and the
 * three keys below QUALIFY the refusal so a caller can put it where it belongs
 * instead of dumping one opaque banner: [fieldName] names the input a typed
 * refusal is about (`EMAIL_TAKEN` → `"email"`), [violations] breaks a
 * `VALIDATION_ERROR` down per input, and [suggestions] carries the free
 * alternates offered alongside a taken handle.
 *
 * All three sit at the ROOT of the error envelope, not under `error` — they are
 * decoded by `ApiResponse` and carried verbatim here. They default to
 * empty/`null` so every existing construction site keeps compiling and every
 * caller that only ever read [message] sees no change.
 */
data class ApiError(
    val message: String,
    val code: String? = null,
    val httpStatus: Int? = null,
    val fieldName: String? = null,
    val suggestions: List<String> = emptyList(),
    val violations: List<ApiViolation> = emptyList(),
)
