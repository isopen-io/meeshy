package me.meeshy.sdk.net

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

data class ApiError(
    val message: String,
    val code: String? = null,
    val httpStatus: Int? = null,
)
