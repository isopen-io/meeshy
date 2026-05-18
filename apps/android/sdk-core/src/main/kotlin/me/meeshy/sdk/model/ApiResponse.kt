package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Standard Meeshy API envelope (all services):
 * `{ success, data?, error?, message?, code?, pagination? }`.
 */
@Serializable
data class ApiResponse<T>(
    val success: Boolean = false,
    val data: T? = null,
    val error: String? = null,
    val message: String? = null,
    val code: String? = null,
    val pagination: Pagination? = null,
)

@Serializable
data class Pagination(
    val total: Int? = null,
    val offset: Int? = null,
    val limit: Int? = null,
    val hasMore: Boolean = false,
    val nextCursor: String? = null,
)
