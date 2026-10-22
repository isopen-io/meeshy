package me.meeshy.core.common

import kotlinx.coroutines.withTimeoutOrNull

public object BoundedResolution {
    public const val DEFAULT_TIMEOUT_MILLIS: Long = 4_000L
    public const val STORY_THUMB_HASH_TIMEOUT_MILLIS: Long = 5_000L
}

public suspend fun <T : Any> resolveBounded(
    timeoutMillis: Long = BoundedResolution.DEFAULT_TIMEOUT_MILLIS,
    operation: suspend () -> T?,
): T? = withTimeoutOrNull(timeoutMillis) { operation() }
